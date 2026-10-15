// db/queries/blood-glucose-logs.ts
//
// Read side of the blood sugar log. Every entry point takes the caller's
// Clerk id and scopes to residents at their locations via the same
// `residentInScope` gate the carb log and incident routes use.

import {and, desc, eq, gte, inArray, isNotNull, isNull, lte, or, type SQL} from 'drizzle-orm';
import {alias} from 'drizzle-orm/pg-core';
import {db} from '../index';
import {bloodGlucoseLogRevisions, bloodGlucoseLogs, residents} from '../schema';
import {AccessDeniedError, requireCareAccess, residentInScope} from '@/lib/db-helpers';
import {computeOperationalDate} from '@/lib/operational-time';
import {
	clockTimeInTimeZone,
	deriveSlotStates,
	deriveSlotsNeedingAttention,
	type SlotState,
} from '@/lib/custom-log-schedule';
import {
	buildGlucoseSchedule,
	normalizeScheduledChecks,
	resolveGlucoseThresholds,
	type GlucoseAction,
	type GlucoseCheckMethod,
	type GlucoseCheckType,
	type GlucoseStatus,
	type GlucoseSymptom,
	type GlucoseThresholds,
	type GlucoseUnit,
} from '@/lib/blood-glucose';
import {activeResidentsOnly} from '@/lib/resident-status-sql';
import {getOperationalTimeZone} from './care';
import {shiftDate} from './carb-logs';

export type GlucoseLogDto = {
	id: string;
	residentId: string;
	residentName?: string;
	location: string;
	operationalDate: string;
	checkedAt: string;
	checkType: GlucoseCheckType;
	method: GlucoseCheckMethod;
	refused: boolean;
	refusalReason: string | null;
	readingValue: number | null;
	readingUnit: GlucoseUnit;
	readingMgDl: number | null;
	status: GlucoseStatus;
	thresholds: GlucoseThresholds;
	symptoms: GlucoseSymptom[];
	actionsTaken: GlucoseAction[];
	notifiedWho: string | null;
	insulinGiven: boolean;
	insulinType: string | null;
	insulinUnits: number | null;
	recheckDueAt: string | null;
	recheckOfId: string | null;
	/** Id of the recheck logged against this reading, if any. */
	recheckId: string | null;
	notes: string | null;
	staffId: string;
	staffNameSnapshot: string;
	loggedAt: string;
	updatedAt: string | null;
	reviewedAt: string | null;
	reviewedByName: string | null;
	reviewComment: string | null;
};

export type GlucoseResidentSettings = {
	thresholds: GlucoseThresholds;
	/** True when every limit is the facility default (none set on the profile). */
	usingDefaultThresholds: boolean;
	scheduledChecks: string[];
	careInstructions: string | null;
};

const recheckChild = alias(bloodGlucoseLogs, 'recheck_child');

type JoinedRow = {
	log: typeof bloodGlucoseLogs.$inferSelect;
	recheckId: string | null;
	residentName?: string;
};

function toDto({log, recheckId, residentName}: JoinedRow): GlucoseLogDto {
	return {
		id: log.id,
		residentId: log.residentId,
		...(residentName !== undefined ? {residentName} : {}),
		location: log.location,
		operationalDate: log.operationalDate,
		checkedAt: log.checkedAt.toISOString(),
		checkType: log.checkType as GlucoseCheckType,
		method: log.method as GlucoseCheckMethod,
		refused: log.refused,
		refusalReason: log.refusalReason,
		readingValue: log.readingValue,
		readingUnit: log.readingUnit as GlucoseUnit,
		readingMgDl: log.readingMgDl,
		status: log.status as GlucoseStatus,
		thresholds: {
			criticalLow: log.criticalLowMgDl,
			low: log.targetLowMgDl,
			high: log.targetHighMgDl,
			criticalHigh: log.criticalHighMgDl,
		},
		symptoms: (log.symptoms ?? []) as GlucoseSymptom[],
		actionsTaken: (log.actionsTaken ?? []) as GlucoseAction[],
		notifiedWho: log.notifiedWho,
		insulinGiven: log.insulinGiven,
		insulinType: log.insulinType,
		insulinUnits: log.insulinUnits,
		recheckDueAt: log.recheckDueAt?.toISOString() ?? null,
		recheckOfId: log.recheckOfId,
		recheckId,
		notes: log.notes,
		staffId: log.staffId,
		staffNameSnapshot: log.staffNameSnapshot,
		loggedAt: log.loggedAt.toISOString(),
		updatedAt: log.updatedAt?.toISOString() ?? null,
		reviewedAt: log.reviewedAt?.toISOString() ?? null,
		reviewedByName: log.reviewedByName,
		reviewComment: log.reviewComment,
	};
}

/** Base select: the log row plus the id of its recheck, if one exists. */
function selectLogs() {
	return db
		.select({log: bloodGlucoseLogs, recheckId: recheckChild.id})
		.from(bloodGlucoseLogs)
		.leftJoin(recheckChild, eq(recheckChild.recheckOfId, bloodGlucoseLogs.id));
}

export function settingsFromResident(resident: {
	glucoseCriticalLowMgDl: number | null;
	glucoseTargetLowMgDl: number | null;
	glucoseTargetHighMgDl: number | null;
	glucoseCriticalHighMgDl: number | null;
	glucoseScheduledChecks: string[] | null;
	glucoseCareInstructions: string | null;
}): GlucoseResidentSettings {
	return {
		thresholds: resolveGlucoseThresholds(resident),
		usingDefaultThresholds:
			resident.glucoseCriticalLowMgDl === null &&
			resident.glucoseTargetLowMgDl === null &&
			resident.glucoseTargetHighMgDl === null &&
			resident.glucoseCriticalHighMgDl === null,
		scheduledChecks: normalizeScheduledChecks(resident.glucoseScheduledChecks),
		careInstructions: resident.glucoseCareInstructions,
	};
}

const SETTINGS_COLUMNS = {
	id: true,
	name: true,
	location: true,
	glucoseTrackingEnabled: true,
	glucoseCriticalLowMgDl: true,
	glucoseTargetLowMgDl: true,
	glucoseTargetHighMgDl: true,
	glucoseCriticalHighMgDl: true,
	glucoseScheduledChecks: true,
	glucoseCareInstructions: true,
} as const;

async function assertResidentReadable(clerkUserId: string, residentId: string) {
	const userRole = await requireCareAccess(clerkUserId);
	const allowed = await residentInScope({
		clerkUserId,
		userRole,
		residentId,
		auditDetail: 'glucose_logs_cross_location',
	});
	if (!allowed) throw new AccessDeniedError('Access denied');
	return userRole;
}

function isSupervisorRole(role: string | null | undefined) {
	const r = (role || '').toLowerCase();
	return r === 'admin' || r === 'supervisor';
}

export type GlucoseResidentView = {
	entries: GlucoseLogDto[];
	today: {operationalDate: string; slots: SlotState[]};
	settings: GlucoseResidentSettings;
	/** Out-of-range readings from the last 24 hours that still need a recheck. */
	pendingRechecks: GlucoseLogDto[];
	viewer: {clerkUserId: string; canReview: boolean};
};

/**
 * Everything the resident's Blood Sugar tab needs in one read: history for
 * the range (default last 14 days), today's scheduled checks, the resident's
 * limits and any rechecks still owed.
 */
export async function getGlucoseResidentView(
	clerkUserId: string,
	residentId: string,
	range?: {from?: string; to?: string}
): Promise<GlucoseResidentView> {
	const userRole = await assertResidentReadable(clerkUserId, residentId);

	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, residentId),
		columns: SETTINGS_COLUMNS,
	});
	if (!resident) throw new AccessDeniedError('Access denied');
	const settings = settingsFromResident(resident);

	const timeZone = await getOperationalTimeZone();
	const now = new Date();
	const today = computeOperationalDate(now, timeZone);
	const to = range?.to ?? today;
	const from = range?.from ?? shiftDate(today, -13);

	const [rows, todayRows, pendingRows] = await Promise.all([
		selectLogs()
			.where(
				and(
					eq(bloodGlucoseLogs.residentId, residentId),
					gte(bloodGlucoseLogs.operationalDate, from),
					lte(bloodGlucoseLogs.operationalDate, to)
				)
			)
			.orderBy(desc(bloodGlucoseLogs.checkedAt)),
		db
			.select({checkType: bloodGlucoseLogs.checkType})
			.from(bloodGlucoseLogs)
			.where(
				and(
					eq(bloodGlucoseLogs.residentId, residentId),
					eq(bloodGlucoseLogs.operationalDate, today)
				)
			),
		selectLogs()
			.where(
				and(
					eq(bloodGlucoseLogs.residentId, residentId),
					...pendingRecheckConditions(now)
				)
			)
			.orderBy(bloodGlucoseLogs.recheckDueAt),
	]);

	return {
		entries: rows.map(toDto),
		today: {
			operationalDate: today,
			slots: deriveSlotStates({
				schedule: buildGlucoseSchedule(settings.scheduledChecks),
				loggedSlotKeys: new Set(todayRows.map((r) => r.checkType)),
				now: clockTimeInTimeZone(now, timeZone),
			}),
		},
		settings,
		pendingRechecks: pendingRows.map(toDto),
		viewer: {clerkUserId, canReview: isSupervisorRole(userRole.role)},
	};
}

/** Rechecks are chased for a day; older misses show up in the oversight view instead. */
const RECHECK_LOOKBACK_MS = 24 * 60 * 60 * 1000;

function pendingRecheckConditions(now: Date): SQL[] {
	return [
		isNotNull(bloodGlucoseLogs.recheckDueAt),
		isNull(recheckChild.id),
		gte(bloodGlucoseLogs.checkedAt, new Date(now.getTime() - RECHECK_LOOKBACK_MS)),
	];
}

export async function getGlucoseLogById(
	clerkUserId: string,
	logId: string
): Promise<GlucoseLogDto> {
	const [row] = await selectLogs().where(eq(bloodGlucoseLogs.id, logId)).limit(1);
	if (!row) throw new AccessDeniedError('Access denied');
	await assertResidentReadable(clerkUserId, row.log.residentId);
	return toDto(row);
}

export type GlucoseRevisionDto = {
	id: string;
	previous: Record<string, unknown>;
	reason: string;
	revisedByName: string;
	revisedAt: string;
};

/** Edit history of one entry, newest first. */
export async function getGlucoseLogRevisions(
	clerkUserId: string,
	logId: string
): Promise<GlucoseRevisionDto[]> {
	const log = await db.query.bloodGlucoseLogs.findFirst({
		where: eq(bloodGlucoseLogs.id, logId),
		columns: {residentId: true},
	});
	if (!log) throw new AccessDeniedError('Access denied');
	await assertResidentReadable(clerkUserId, log.residentId);

	const rows = await db.query.bloodGlucoseLogRevisions.findMany({
		where: eq(bloodGlucoseLogRevisions.logId, logId),
		orderBy: [desc(bloodGlucoseLogRevisions.revisedAt)],
	});
	return rows.map((row) => ({
		id: row.id,
		previous: row.previous,
		reason: row.reason,
		revisedByName: row.revisedByName,
		revisedAt: row.revisedAt.toISOString(),
	}));
}

export type GlucoseReminders = {
	/** Scheduled checks that are due now or missed today. */
	scheduled: Array<{
		residentId: string;
		residentName: string;
		location: string;
		operationalDate: string;
		slots: SlotState[];
	}>;
	/** Out-of-range readings still waiting for a recheck. */
	rechecks: Array<{
		logId: string;
		residentId: string;
		residentName: string;
		location: string;
		status: GlucoseStatus;
		checkedAt: string;
		recheckDueAt: string;
	}>;
	/** Supervisors/admins only: out-of-range readings from the last 3 days not yet reviewed. */
	unreviewed: Array<{
		logId: string;
		residentId: string;
		residentName: string;
		location: string;
		status: GlucoseStatus;
		readingValue: number | null;
		readingUnit: GlucoseUnit;
		checkedAt: string;
	}>;
};

const UNREVIEWED_LOOKBACK_DAYS = 3;
const OUT_OF_RANGE: GlucoseStatus[] = ['critical_low', 'low', 'high', 'critical_high'];

/**
 * Dashboard feed for the caller's locations (all locations for admins).
 * Non-blocking by design, like the carb log reminders.
 */
export async function getGlucoseRemindersForUser(
	clerkUserId: string
): Promise<GlucoseReminders> {
	const empty: GlucoseReminders = {scheduled: [], rechecks: [], unreviewed: []};
	const userRole = await requireCareAccess(clerkUserId);
	const isAdmin = (userRole.role || '').toLowerCase() === 'admin';
	const locationNames = userRole.locations ?? [];
	if (!isAdmin && locationNames.length === 0) return empty;

	const tracked = await db.query.residents.findMany({
		where: and(
			eq(residents.glucoseTrackingEnabled, true),
			activeResidentsOnly(),
			isAdmin ? undefined : inArray(residents.location, locationNames)
		),
		columns: SETTINGS_COLUMNS,
		orderBy: [residents.location, residents.name],
	});
	if (tracked.length === 0) return empty;

	const timeZone = await getOperationalTimeZone();
	const now = new Date();
	const today = computeOperationalDate(now, timeZone);
	const nowClock = clockTimeInTimeZone(now, timeZone);
	const ids = tracked.map((r) => r.id);
	const byId = new Map(tracked.map((r) => [r.id, r]));

	const [todayRows, pendingRows, unreviewedRows] = await Promise.all([
		db
			.select({residentId: bloodGlucoseLogs.residentId, checkType: bloodGlucoseLogs.checkType})
			.from(bloodGlucoseLogs)
			.where(
				and(
					inArray(bloodGlucoseLogs.residentId, ids),
					eq(bloodGlucoseLogs.operationalDate, today)
				)
			),
		selectLogs()
			.where(and(inArray(bloodGlucoseLogs.residentId, ids), ...pendingRecheckConditions(now)))
			.orderBy(bloodGlucoseLogs.recheckDueAt),
		isSupervisorRole(userRole.role)
			? db
					.select({log: bloodGlucoseLogs})
					.from(bloodGlucoseLogs)
					.where(
						and(
							inArray(bloodGlucoseLogs.residentId, ids),
							inArray(bloodGlucoseLogs.status, OUT_OF_RANGE),
							isNull(bloodGlucoseLogs.reviewedAt),
							gte(
								bloodGlucoseLogs.operationalDate,
								shiftDate(today, -(UNREVIEWED_LOOKBACK_DAYS - 1))
							)
						)
					)
					.orderBy(desc(bloodGlucoseLogs.checkedAt))
			: Promise.resolve([] as Array<{log: typeof bloodGlucoseLogs.$inferSelect}>),
	]);

	const loggedByResident = new Map<string, Set<string>>();
	for (const row of todayRows) {
		const set = loggedByResident.get(row.residentId) ?? new Set<string>();
		set.add(row.checkType);
		loggedByResident.set(row.residentId, set);
	}

	const scheduled: GlucoseReminders['scheduled'] = [];
	for (const resident of tracked) {
		const slots = deriveSlotsNeedingAttention({
			schedule: buildGlucoseSchedule(normalizeScheduledChecks(resident.glucoseScheduledChecks)),
			loggedSlotKeys: loggedByResident.get(resident.id) ?? new Set(),
			now: nowClock,
		});
		if (slots.length === 0) continue;
		scheduled.push({
			residentId: resident.id,
			residentName: resident.name,
			location: resident.location,
			operationalDate: today,
			slots,
		});
	}

	return {
		scheduled,
		rechecks: pendingRows.map(({log}) => ({
			logId: log.id,
			residentId: log.residentId,
			residentName: byId.get(log.residentId)?.name ?? '',
			location: log.location,
			status: log.status as GlucoseStatus,
			checkedAt: log.checkedAt.toISOString(),
			recheckDueAt: (log.recheckDueAt as Date).toISOString(),
		})),
		unreviewed: unreviewedRows.map(({log}) => ({
			logId: log.id,
			residentId: log.residentId,
			residentName: byId.get(log.residentId)?.name ?? '',
			location: log.location,
			status: log.status as GlucoseStatus,
			readingValue: log.readingValue,
			readingUnit: log.readingUnit as GlucoseUnit,
			checkedAt: log.checkedAt.toISOString(),
		})),
	};
}

export type GlucoseScopeFilters = {
	/** Location NAME, as stored on residents/blood_glucose_logs. */
	location?: string;
	residentId?: string;
	from?: string;
	to?: string;
	/** 'attention' = out of range or refused; 'unreviewed' = out of range and not yet reviewed. */
	show?: 'all' | 'attention' | 'unreviewed';
};

export type GlucoseScopeResult = {
	from: string;
	to: string;
	entries: GlucoseLogDto[];
	/** True when the result hit SCOPE_LIMIT and older rows were left out. */
	truncated: boolean;
	canReview: boolean;
};

const SCOPE_LIMIT = 500;

/**
 * Oversight read across residents. Kept separate from the per-resident read
 * for the same reason as getCarbLogsForScope: this one gates on the caller's
 * location set, the other fails closed on a single resident id.
 */
export async function getGlucoseLogsForScope(
	clerkUserId: string,
	filters: GlucoseScopeFilters = {}
): Promise<GlucoseScopeResult> {
	const userRole = await requireCareAccess(clerkUserId);
	const isAdmin = (userRole.role || '').toLowerCase() === 'admin';
	const canReview = isSupervisorRole(userRole.role);
	const authorizedLocations = userRole.locations ?? [];

	const timeZone = await getOperationalTimeZone();
	const today = computeOperationalDate(new Date(), timeZone);
	const to = filters.to ?? today;
	const from = filters.from ?? shiftDate(to, -13);

	if (filters.residentId) {
		const allowed = await residentInScope({
			clerkUserId,
			userRole,
			residentId: filters.residentId,
			auditDetail: 'glucose_logs_scope_cross_location',
		});
		if (!allowed) throw new AccessDeniedError('Access denied');
	}

	const conditions: SQL[] = [
		gte(bloodGlucoseLogs.operationalDate, from),
		lte(bloodGlucoseLogs.operationalDate, to),
	];
	if (filters.residentId) conditions.push(eq(bloodGlucoseLogs.residentId, filters.residentId));

	if (!isAdmin) {
		if (authorizedLocations.length === 0) {
			return {from, to, entries: [], truncated: false, canReview};
		}
		if (filters.location) {
			if (!authorizedLocations.includes(filters.location)) {
				throw new AccessDeniedError('Access denied');
			}
			conditions.push(eq(bloodGlucoseLogs.location, filters.location));
		} else {
			conditions.push(inArray(bloodGlucoseLogs.location, authorizedLocations));
		}
	} else if (filters.location) {
		conditions.push(eq(bloodGlucoseLogs.location, filters.location));
	}

	if (filters.show === 'attention') {
		conditions.push(
			or(
				inArray(bloodGlucoseLogs.status, OUT_OF_RANGE),
				eq(bloodGlucoseLogs.refused, true)
			) as SQL
		);
	} else if (filters.show === 'unreviewed') {
		conditions.push(inArray(bloodGlucoseLogs.status, OUT_OF_RANGE));
		conditions.push(isNull(bloodGlucoseLogs.reviewedAt));
	}

	const rows = await db
		.select({log: bloodGlucoseLogs, recheckId: recheckChild.id, residentName: residents.name})
		.from(bloodGlucoseLogs)
		.innerJoin(residents, eq(residents.id, bloodGlucoseLogs.residentId))
		.leftJoin(recheckChild, eq(recheckChild.recheckOfId, bloodGlucoseLogs.id))
		.where(and(...conditions))
		.orderBy(desc(bloodGlucoseLogs.checkedAt))
		.limit(SCOPE_LIMIT + 1);

	return {
		from,
		to,
		entries: rows.slice(0, SCOPE_LIMIT).map(toDto),
		truncated: rows.length > SCOPE_LIMIT,
		canReview,
	};
}
