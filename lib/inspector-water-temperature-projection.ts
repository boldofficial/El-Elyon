// lib/inspector-water-temperature-projection.ts
//
// Minimal, location-bound read model of the Daily Water Temperature Check Log
// for a live OTP inspector session (U6 / R15-R16, R18).
//
// The projection is an EXPLICIT ALLOWLIST: every field of every returned
// object is constructed by name below. There is no spread, no
// `delete`, and no denylist anywhere in this file, so a column added to
// `waterTemperatureChecks` / `waterTemperatureRechecks` -- or a field added to
// the supervisor DTO -- cannot reach an inspector by default. Adding a field
// here is a deliberate, reviewable edit.
//
// Deliberately EXCLUDED (see INSPECTOR_WATER_TEMPERATURE_FORBIDDEN_KEYS):
// full staff names, Clerk/actor IDs, shift IDs, record IDs, location IDs,
// header versions, revision snapshots, void metadata and voided rows,
// supersession reasons, idempotency keys, timezone snapshots, and every
// internal audit timestamp.
//
// This module has no database, Next.js, or React dependency so it can be
// exercised directly under `node:test`.

import {tenthsToFahrenheit} from './water-temperature';

export class InspectorWaterTemperatureScopeError extends Error {
	constructor() {
		super('Inspector water-temperature location is unavailable');
		this.name = 'InspectorWaterTemperatureScopeError';
	}
}

// ============================================================================
// PUBLIC SHAPE (what an inspector may see)
// ============================================================================

export type InspectorShiftSlot = 1 | 2 | 3;

export type InspectorWaterTemperatureFixture = 'kitchen' | 'bath_shower';

export type InspectorWaterTemperatureState =
	| 'complete'
	| 'complete_with_attention'
	| 'action_required'
	| 'recheck_required';

export interface InspectorWaterTemperatureRecheck {
	fixture: InspectorWaterTemperatureFixture;
	tempF: number;
	/** Initials only. A full staff name never reaches an inspector (R15). */
	staffInitials: string;
	measuredAt: string;
	/** Ordinal position in the append-only chain, so the inspector view and the
	 * printed sheet order rechecks identically. Not a record identifier. */
	sequence: number;
	/** Collapses "superseded" and "voided recheck" into the single fact the
	 * printed form shows. The reason, actor, and timestamp stay privileged. */
	superseded: boolean;
}

export interface InspectorWaterTemperatureCheck {
	operationalDate: string;
	shiftSlot: InspectorShiftSlot;
	/** The ORIGINAL observations (R7): a fixture that read 118.0 reads 118.0
	 * here, never the later safe recheck value. */
	kitchenTempF: number;
	bathTempF: number;
	staffInitials: string;
	comments: string | null;
	action: string | null;
	state: InspectorWaterTemperatureState;
	rechecks: InspectorWaterTemperatureRecheck[];
}

export interface InspectorWaterTemperatureMonth {
	houseName: string;
	year: number;
	month: number;
	checks: InspectorWaterTemperatureCheck[];
}

/**
 * Keys that must never appear anywhere in a serialized inspector
 * water-temperature response, at any nesting depth. Exported so the projection
 * test and the route test assert one shared contract rather than two drifting
 * lists.
 */
export const INSPECTOR_WATER_TEMPERATURE_FORBIDDEN_KEYS: readonly string[] = [
	'id',
	'checkId',
	'locationId',
	'shiftId',
	'staffId',
	'staffName',
	'staffNameSnapshot',
	'staffInitialsSnapshot',
	'houseNameSnapshot',
	'clerkUserId',
	'accessId',
	'createdBy',
	'updatedBy',
	'version',
	'revisions',
	'revision',
	'voidedAt',
	'voidedBy',
	'voidReason',
	'supersededAt',
	'supersededBy',
	'supersededReason',
	'idempotencyKey',
	'operationalTimeZoneSnapshot',
	'observedAt',
	'createdAt',
	'updatedAt',
	'kitchenTempTenths',
	'bathTempTenths',
	'tempTenths',
	'otpHash',
	'expiresAt',
];

// ============================================================================
// RAW INPUT (database rows -- assumed to carry secrets)
// ============================================================================

/** `Record<string, unknown>` is intentional: the raw rows are treated as
 * arbitrary, secret-bearing objects so the allowlist below is the only thing
 * deciding what escapes. */
export type RawInspectorWaterTemperatureCheck = {
	id: string;
	operationalDate: string;
	shiftSlot: number;
	kitchenTempTenths: number;
	bathTempTenths: number;
	staffInitialsSnapshot: string;
	comments: string | null;
	action: string | null;
	state: string;
	voidedAt?: Date | string | null;
} & Record<string, unknown>;

export type RawInspectorWaterTemperatureRecheck = {
	checkId: string;
	fixture: string;
	tempTenths: number;
	staffInitialsSnapshot: string;
	measuredAt: Date | string;
	sequence: number;
	supersededAt?: Date | string | null;
	voidedAt?: Date | string | null;
} & Record<string, unknown>;

// ============================================================================
// MONTH BOUNDS + SELECTOR VALIDATION
// ============================================================================

export function isValidInspectorReportYear(year: number): boolean {
	return Number.isInteger(year) && year >= 2020 && year <= 2100;
}

export function isValidInspectorReportMonth(month: number): boolean {
	return Number.isInteger(month) && month >= 1 && month <= 12;
}

/** Inclusive `YYYY-MM-DD` bounds for one operational month. Uses a UTC day-0
 * rollover so a database or server timezone cannot move the boundary. */
export function inspectorWaterTemperatureMonthBounds(
	year: number,
	month: number
): {start: string; end: string} {
	if (!isValidInspectorReportYear(year) || !isValidInspectorReportMonth(month)) {
		throw new TypeError('Inspector water-temperature month selection is out of range');
	}
	const pad = (value: number) => String(value).padStart(2, '0');
	const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return {
		start: `${year}-${pad(month)}-01`,
		end: `${year}-${pad(month)}-${pad(lastDay)}`,
	};
}

// ============================================================================
// PROJECTION
// ============================================================================

export function projectInspectorWaterTemperatureMonth(args: {
	/** Resolved server-side from the session's immutable location ID. Only the
	 * NAME is projected; the ID stays inside the server boundary. */
	location: {id: string; name: string};
	year: number;
	month: number;
	checks: readonly RawInspectorWaterTemperatureCheck[];
	rechecks: readonly RawInspectorWaterTemperatureRecheck[];
}): InspectorWaterTemperatureMonth {
	if (!isValidInspectorReportYear(args.year) || !isValidInspectorReportMonth(args.month)) {
		throw new TypeError('Inspector water-temperature month selection is out of range');
	}
	const {start, end} = inspectorWaterTemperatureMonthBounds(args.year, args.month);

	const rechecksByCheckId = new Map<string, RawInspectorWaterTemperatureRecheck[]>();
	for (const recheck of args.rechecks) {
		const list = rechecksByCheckId.get(recheck.checkId) ?? [];
		list.push(recheck);
		rechecksByCheckId.set(recheck.checkId, list);
	}

	const checks: InspectorWaterTemperatureCheck[] = [];
	for (const row of args.checks) {
		// Voided rows never reach an inspector. The query already excludes
		// them; this is the second, independent gate (R15).
		if (row.voidedAt) continue;
		if (row.operationalDate < start || row.operationalDate > end) {
			throw new TypeError('Water-temperature record falls outside the requested month');
		}
		checks.push({
			operationalDate: row.operationalDate,
			shiftSlot: requireShiftSlot(row.shiftSlot),
			kitchenTempF: tenthsToFahrenheit(row.kitchenTempTenths),
			bathTempF: tenthsToFahrenheit(row.bathTempTenths),
			staffInitials: row.staffInitialsSnapshot,
			comments: row.comments,
			action: row.action,
			state: requireCheckState(row.state),
			rechecks: (rechecksByCheckId.get(row.id) ?? [])
				.slice()
				.sort((left, right) => left.sequence - right.sequence)
				.map((recheck) => ({
					fixture: requireFixture(recheck.fixture),
					tempF: tenthsToFahrenheit(recheck.tempTenths),
					staffInitials: recheck.staffInitialsSnapshot,
					measuredAt: serializeInstant(recheck.measuredAt),
					sequence: recheck.sequence,
					superseded: Boolean(recheck.supersededAt) || Boolean(recheck.voidedAt),
				})),
		});
	}

	checks.sort(
		(left, right) =>
			left.operationalDate.localeCompare(right.operationalDate) ||
			left.shiftSlot - right.shiftSlot
	);

	return {
		houseName: args.location.name,
		year: args.year,
		month: args.month,
		checks,
	};
}

function serializeInstant(value: Date | string): string {
	return value instanceof Date ? value.toISOString() : value;
}

function requireShiftSlot(value: number): InspectorShiftSlot {
	if (value === 1 || value === 2 || value === 3) return value;
	throw new TypeError('Invalid water-temperature shift slot');
}

function requireCheckState(value: string): InspectorWaterTemperatureState {
	if (
		value === 'complete' ||
		value === 'complete_with_attention' ||
		value === 'action_required' ||
		value === 'recheck_required'
	) {
		return value;
	}
	throw new TypeError('Invalid water-temperature state');
}

function requireFixture(value: string): InspectorWaterTemperatureFixture {
	if (value === 'kitchen' || value === 'bath_shower') return value;
	throw new TypeError('Invalid water-temperature fixture');
}
