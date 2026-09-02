import {db} from '@/db/index';
import {
	employees,
	shifts,
	users,
	waterTemperatureChecks,
	waterTemperatureRechecks,
} from '@/db/schema';
import {
	getLifeSafetyAccessContext,
	resolveActiveLocationById,
	resolveAuthorizedActiveLocations,
} from '@/db/queries/life-safety';
import {AccessDeniedError, requireCareAccess} from '@/lib/db-helpers';
import {
	classifyFixtureReading,
	tenthsToFahrenheit,
	type ShiftSlot,
	type WaterTemperatureCheckState,
	type WaterTemperatureFixture,
	type WaterTemperatureRevisionAction,
} from '@/lib/water-temperature';
import {and, asc, desc, eq, gte, inArray, isNull, lte} from 'drizzle-orm';

// ============================================================================
// ERRORS
//
// Distinct from the life-safety error classes (db/queries/life-safety.ts) so
// the water-temperature route helper (_water-temperature-route.ts) can map
// them independently. `WaterTemperatureNotFoundError` is used for both
// genuinely-absent records and records outside the caller's authorization,
// per R18: absent and unauthorized IDs must be indistinguishable.
// ============================================================================

export class WaterTemperatureNotFoundError extends Error {
	constructor(message = 'Water-temperature record not found') {
		super(message);
		this.name = 'WaterTemperatureNotFoundError';
	}
}

/**
 * Water-temperature-specific authorization failure. Extends the shared
 * `AccessDeniedError` (lib/db-helpers.ts) so route handlers map every
 * authorization failure -- this one and the `require*Access` helpers' --
 * with a single typed `instanceof AccessDeniedError` check instead of
 * substring-matching human-readable error text.
 */
export class WaterTemperatureAccessDeniedError extends AccessDeniedError {
	constructor(message = 'Access denied') {
		super(message);
		this.name = 'WaterTemperatureAccessDeniedError';
	}
}

// Raised when staff/replacement-staff writes (create, action, recheck) are
// attempted without a currently open, classified shift matching the target
// identity. Distinct from WaterTemperatureConflictError so the route can
// return a clear, typed reason rather than an opaque version conflict.
export class WaterTemperatureShiftRequiredError extends Error {
	constructor(
		message = 'An active, classified shift for this house/date/slot is required.'
	) {
		super(message);
		this.name = 'WaterTemperatureShiftRequiredError';
	}
}

export type WaterTemperatureConflictCode =
	| 'VERSION_CONFLICT'
	| 'UNIQUE_CONFLICT'
	| 'STATE_CONFLICT';

export class WaterTemperatureConflictError extends Error {
	readonly code: WaterTemperatureConflictCode;
	readonly current: WaterTemperatureCheckDto | null;

	constructor(
		message: string,
		code: WaterTemperatureConflictCode = 'VERSION_CONFLICT',
		current: WaterTemperatureCheckDto | null = null
	) {
		super(message);
		this.name = 'WaterTemperatureConflictError';
		this.code = code;
		this.current = current;
	}
}

// ============================================================================
// ACCESS CONTEXT + LOCATION AUTHORIZATION
//
// Reuses the generic (not life-safety-specific) role/location resolution
// helpers from db/queries/life-safety.ts rather than reimplementing them --
// they only ever touch `roles`/`employees`/`locations`, so they are safe,
// tested infrastructure for any care-scoped domain.
// ============================================================================

export type WaterTemperatureAccessContext = {
	clerkUserId: string;
	isAdmin: boolean;
	locationNames: string[];
};

export async function getWaterTemperatureAccessContext(
	clerkUserId: string
): Promise<WaterTemperatureAccessContext> {
	return getLifeSafetyAccessContext(clerkUserId);
}

export async function resolveAuthorizedWaterTemperatureLocation(
	context: WaterTemperatureAccessContext,
	locationId: string
): Promise<{id: string; name: string}> {
	const authorizedLocations = await resolveAuthorizedActiveLocations(context);
	if (!authorizedLocations || authorizedLocations.length === 0) {
		throw new WaterTemperatureNotFoundError();
	}
	if (context.isAdmin) {
		const location = await resolveActiveLocationById(locationId);
		if (!location) throw new WaterTemperatureNotFoundError();
		return location;
	}
	const location = authorizedLocations.find((entry) => entry.id === locationId);
	if (!location) throw new WaterTemperatureNotFoundError();
	return location;
}

async function resolveAuthorizedLocationIds(
	context: WaterTemperatureAccessContext
): Promise<string[]> {
	const authorizedLocations = await resolveAuthorizedActiveLocations(context);
	if (!authorizedLocations || authorizedLocations.length === 0) {
		throw new WaterTemperatureNotFoundError();
	}
	return authorizedLocations.map((location) => location.id);
}

// ============================================================================
// STAFF / ACTOR SNAPSHOT RESOLUTION
// ============================================================================

const MAX_STAFF_INITIALS_LENGTH = 10;

/**
 * Deterministically derives display initials from a server-resolved staff
 * display name (there is no dedicated initials column on employees/users).
 * Never derived from client input -- see R4's "server-derived staff ID/
 * name/initial snapshots" requirement.
 */
export function computeStaffInitials(name: string): string {
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return 'STAFF';
	const initials = words
		.slice(0, MAX_STAFF_INITIALS_LENGTH)
		.map((word) => word[0]!.toUpperCase())
		.join('')
		.slice(0, MAX_STAFF_INITIALS_LENGTH);
	return initials || 'STAFF';
}

export type StaffSnapshot = {
	staffId: string;
	staffName: string;
	staffInitials: string;
};

/** Resolves the caller's server-side display name the same way life-safety's
 * mutation-layer audit actor resolution does (employees, then users), then
 * derives initials. Never trusts client-supplied name/initials. */
export async function resolveStaffSnapshot(
	clerkUserId: string
): Promise<StaffSnapshot> {
	const [[employee], [user]] = await Promise.all([
		db
			.select({name: employees.name})
			.from(employees)
			.where(eq(employees.clerkUserId, clerkUserId))
			.limit(1),
		db
			.select({name: users.name})
			.from(users)
			.where(eq(users.clerkUserId, clerkUserId))
			.limit(1),
	]);
	const staffName = employee?.name || user?.name || 'Staff Member';
	return {
		staffId: clerkUserId,
		staffName,
		staffInitials: computeStaffInitials(staffName),
	};
}

// ============================================================================
// ACTIVE SHIFT IDENTITY (for staff create/action/recheck derivation)
// ============================================================================

export type ActiveShiftIdentity = {
	shiftId: string;
	locationId: string;
	houseName: string;
	shiftSlot: ShiftSlot;
	operationalDate: string;
};

/**
 * Loads the caller's currently open shift and returns its frozen identity
 * only when it has been classified (locationId/shiftSlot/operationalDate all
 * populated -- see U2). Returns null for "no open shift" and for an
 * unclassified legacy shift alike: neither can anchor a water-temperature
 * write. Never accepts client-supplied location/date/slot (R16).
 */
export async function getActiveShiftIdentity(
	clerkUserId: string
): Promise<ActiveShiftIdentity | null> {
	await requireCareAccess(clerkUserId);
	const [shift] = await db
		.select({
			id: shifts.id,
			location: shifts.location,
			locationId: shifts.locationId,
			shiftSlot: shifts.shiftSlot,
			operationalDate: shifts.operationalDate,
		})
		.from(shifts)
		.where(and(eq(shifts.clerkUserId, clerkUserId), isNull(shifts.clockOutTime)))
		.orderBy(desc(shifts.clockInTime))
		.limit(1);

	if (
		!shift ||
		shift.locationId === null ||
		shift.shiftSlot === null ||
		shift.operationalDate === null
	) {
		return null;
	}

	return {
		shiftId: shift.id,
		locationId: shift.locationId,
		houseName: shift.location,
		shiftSlot: shift.shiftSlot as ShiftSlot,
		operationalDate: shift.operationalDate,
	};
}

// ============================================================================
// DTOs
// ============================================================================

export type WaterTemperatureRecheckDto = {
	id: string;
	fixture: WaterTemperatureFixture;
	tempF: number;
	classification: ReturnType<typeof classifyFixtureReading>;
	staffId: string;
	staffName: string;
	staffInitials: string;
	measuredAt: string;
	sequence: number;
	supersededAt: string | null;
	supersededReason: string | null;
	voidedAt: string | null;
};

export type WaterTemperatureCheckDto = {
	id: string;
	locationId: string;
	houseName: string;
	operationalDate: string;
	shiftSlot: ShiftSlot;
	shiftId: string | null;
	kitchenTempF: number;
	bathTempF: number;
	kitchenClassification: ReturnType<typeof classifyFixtureReading>;
	bathClassification: ReturnType<typeof classifyFixtureReading>;
	staffId: string;
	staffName: string;
	staffInitials: string;
	observedAt: string;
	comments: string | null;
	action: string | null;
	state: WaterTemperatureCheckState;
	version: number;
	voidedAt: string | null;
	voidedBy: string | null;
	voidReason: string | null;
	rechecks: WaterTemperatureRecheckDto[];
};

type CheckRow = typeof waterTemperatureChecks.$inferSelect;
type RecheckRow = typeof waterTemperatureRechecks.$inferSelect;

export function toRecheckDto(row: RecheckRow): WaterTemperatureRecheckDto {
	return {
		id: row.id,
		fixture: row.fixture as WaterTemperatureFixture,
		tempF: tenthsToFahrenheit(row.tempTenths),
		classification: classifyFixtureReading(row.tempTenths),
		staffId: row.staffId,
		staffName: row.staffNameSnapshot,
		staffInitials: row.staffInitialsSnapshot,
		measuredAt: toIso(row.measuredAt),
		sequence: row.sequence,
		supersededAt: toIsoOrNull(row.supersededAt),
		supersededReason: row.supersededReason,
		voidedAt: toIsoOrNull(row.voidedAt),
	};
}

export function toCheckDto(row: CheckRow, rechecks: RecheckRow[]): WaterTemperatureCheckDto {
	return {
		id: row.id,
		locationId: row.locationId,
		houseName: row.houseNameSnapshot,
		operationalDate: row.operationalDate,
		shiftSlot: row.shiftSlot as ShiftSlot,
		shiftId: row.shiftId,
		kitchenTempF: tenthsToFahrenheit(row.kitchenTempTenths),
		bathTempF: tenthsToFahrenheit(row.bathTempTenths),
		kitchenClassification: classifyFixtureReading(row.kitchenTempTenths),
		bathClassification: classifyFixtureReading(row.bathTempTenths),
		staffId: row.staffId,
		staffName: row.staffNameSnapshot,
		staffInitials: row.staffInitialsSnapshot,
		observedAt: toIso(row.observedAt),
		comments: row.comments,
		action: row.action,
		state: row.state as WaterTemperatureCheckState,
		version: row.version,
		voidedAt: toIsoOrNull(row.voidedAt),
		voidedBy: row.voidedBy,
		voidReason: row.voidReason,
		rechecks: rechecks
			.slice()
			.sort((a, b) => a.sequence - b.sequence)
			.map(toRecheckDto),
	};
}

function toIso(value: Date): string {
	return value.toISOString();
}
function toIsoOrNull(value: Date | null): string | null {
	return value ? value.toISOString() : null;
}

// ============================================================================
// READS
// ============================================================================

async function fetchRechecks(checkId: string): Promise<RecheckRow[]> {
	return db
		.select()
		.from(waterTemperatureRechecks)
		.where(eq(waterTemperatureRechecks.checkId, checkId))
		.orderBy(asc(waterTemperatureRechecks.sequence));
}

/** Detail lookup, scoped to the caller's authorized locations. Absent and
 * unauthorized IDs are indistinguishable (both throw WaterTemperatureNotFoundError). */
export async function getWaterTemperatureCheck(args: {
	clerkUserId: string;
	id: string;
}): Promise<WaterTemperatureCheckDto> {
	const context = await getWaterTemperatureAccessContext(args.clerkUserId);
	const allowedLocationIds = await resolveAuthorizedLocationIds(context);
	const [row] = await db
		.select()
		.from(waterTemperatureChecks)
		.where(
			and(
				eq(waterTemperatureChecks.id, args.id),
				inArray(waterTemperatureChecks.locationId, allowedLocationIds)
			)
		)
		.limit(1);
	if (!row) throw new WaterTemperatureNotFoundError();
	const rechecks = await fetchRechecks(row.id);
	return toCheckDto(row, rechecks);
}

/** Internal-only variant used by mutations: fetches by id + a single,
 * already-authorized locationId, without re-resolving the caller's full
 * authorized set. Returns null (not a throw) so callers can distinguish
 * "does not exist here" from other failure modes explicitly. */
export async function findWaterTemperatureCheckByLocation(
	id: string,
	locationId: string
): Promise<WaterTemperatureCheckDto | null> {
	const [row] = await db
		.select()
		.from(waterTemperatureChecks)
		.where(and(eq(waterTemperatureChecks.id, id), eq(waterTemperatureChecks.locationId, locationId)))
		.limit(1);
	if (!row) return null;
	const rechecks = await fetchRechecks(row.id);
	return toCheckDto(row, rechecks);
}

function monthBounds(year: number, month: number): {start: string; end: string} {
	const pad = (n: number) => String(n).padStart(2, '0');
	const start = `${year}-${pad(month)}-01`;
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const end = `${year}-${pad(month)}-${pad(lastDay)}`;
	return {start, end};
}

/** Authorized month listing for the digital review workspace / print report
 * (U5 consumes this). Standard results are limited to active (non-voided)
 * records unless includeVoided is explicitly requested (still
 * location-scoped either way). */
export async function listWaterTemperatureChecksForMonth(args: {
	clerkUserId: string;
	locationId: string;
	year: number;
	month: number;
	includeVoided?: boolean;
}): Promise<WaterTemperatureCheckDto[]> {
	const context = await getWaterTemperatureAccessContext(args.clerkUserId);
	const location = await resolveAuthorizedWaterTemperatureLocation(context, args.locationId);
	const {start, end} = monthBounds(args.year, args.month);
	const conditions = [
		eq(waterTemperatureChecks.locationId, location.id),
		gte(waterTemperatureChecks.operationalDate, start),
		lte(waterTemperatureChecks.operationalDate, end),
	];
	if (!args.includeVoided) conditions.push(isNull(waterTemperatureChecks.voidedAt));

	const rows = await db
		.select()
		.from(waterTemperatureChecks)
		.where(and(...conditions))
		.orderBy(asc(waterTemperatureChecks.operationalDate), asc(waterTemperatureChecks.shiftSlot));
	if (rows.length === 0) return [];

	const rechecksRows = await db
		.select()
		.from(waterTemperatureRechecks)
		.where(
			inArray(
				waterTemperatureRechecks.checkId,
				rows.map((row) => row.id)
			)
		)
		.orderBy(asc(waterTemperatureRechecks.sequence));

	const rechecksByCheckId = new Map<string, RecheckRow[]>();
	for (const recheck of rechecksRows) {
		const list = rechecksByCheckId.get(recheck.checkId) ?? [];
		list.push(recheck);
		rechecksByCheckId.set(recheck.checkId, list);
	}

	return rows.map((row) => toCheckDto(row, rechecksByCheckId.get(row.id) ?? []));
}

// ============================================================================
// STATUS (no-query current-shift status)
// ============================================================================

export type WaterTemperatureStatus =
	| 'due'
	| 'action_required'
	| 'recheck_required'
	| 'complete'
	| 'complete_with_attention'
	| 'no_shift'
	| 'unknown';

// `no_shift` and `unknown` are deliberately distinct (U4 amendment to U3's
// contract). R9 reserves `unknown` for "unable to verify" -- a state that must
// show a retry affordance and must never read as complete. A caller with no
// open/classified shift is not uncertain at all: there is simply no obligation
// addressed to them, and collapsing that into `unknown` would show every
// clocked-out user a spurious "unable to verify, retry" banner. The server
// therefore returns `no_shift` for that case and never returns `unknown`; the
// client synthesizes `unknown` locally when a status fetch fails, is aborted,
// or returns a non-200/unrecognized payload.

/**
 * Resolves the coarse status/CTA for the caller's currently active shift.
 * Contains no temperatures, notes, predecessor identity, raw location ID, or
 * record ID (R8/KTD5) -- callers must not widen this DTO. Never accepts a
 * client-supplied house/date/slot: identity comes exclusively from the
 * caller's own open, classified shift.
 */
export async function getWaterTemperatureStatusForCurrentShift(
	clerkUserId: string
): Promise<{status: WaterTemperatureStatus}> {
	const identity = await getActiveShiftIdentity(clerkUserId);
	if (!identity) return {status: 'no_shift'};

	const [row] = await db
		.select({state: waterTemperatureChecks.state})
		.from(waterTemperatureChecks)
		.where(
			and(
				eq(waterTemperatureChecks.locationId, identity.locationId),
				eq(waterTemperatureChecks.operationalDate, identity.operationalDate),
				eq(waterTemperatureChecks.shiftSlot, identity.shiftSlot),
				isNull(waterTemperatureChecks.voidedAt)
			)
		)
		.limit(1);

	if (!row) return {status: 'due'};
	return {status: row.state as WaterTemperatureStatus};
}

export type {WaterTemperatureFixture, WaterTemperatureCheckState, WaterTemperatureRevisionAction};
