// lib/resident-status.ts
//
// Single source of truth for "has this resident left the facility?", plus the
// shared wording for a resident's status: the badge on the resident list and
// the leaving-date field on the admin profile both read from here so they
// always agree.
//
// A resident who leaves is never deleted -- licensing requires the record to
// survive -- so `residents.status` is the only thing separating a current
// resident from a historical one. Before this module each call site re-derived
// that separately (or, more often, forgot to), which is how departed residents
// kept generating ISP and fire-evac reminders.
//
// Two details worth knowing:
//
//   1. `status` is a plain varchar(20), not a pg enum. Migration 0006 added it
//      with DEFAULT 'active', and the write path normalises anything that is
//      not exactly 'inactive' back to 'active'. So the safe read is "inactive
//      means inactive, everything else -- including null on a row written
//      before 0006 -- means active". Inverting that test would silently mute
//      alerts for legacy rows.
//
//   2. Hiding an inactive resident applies to LISTS, not to lookups by id.
//      Their profile, logs, ISPs and drill history must still open on a direct
//      link; that is the whole point of keeping the record. What stops is new
//      writes and outbound notices.
//
// This module is imported by client components, so it stays free of database
// imports. The Drizzle filter lives in lib/resident-status-sql.ts.

export const RESIDENT_ACTIVE = 'active' as const;
export const RESIDENT_INACTIVE = 'inactive' as const;

export type ResidentStatus = typeof RESIDENT_ACTIVE | typeof RESIDENT_INACTIVE;

/** Reasons the admin UI offers when marking a resident inactive. */
export const INACTIVE_REASONS = [
	'deceased',
	'placement_terminated',
	'discharged',
] as const;

export type InactiveReason = (typeof INACTIVE_REASONS)[number];

type StatusBearing = {status?: string | null};

/** True while the resident is still placed at the facility. */
export function isActiveResident(resident: StatusBearing): boolean {
	return (resident.status ?? RESIDENT_ACTIVE) !== RESIDENT_INACTIVE;
}

/** True once the resident has left, for whatever reason. */
export function isInactiveResident(resident: StatusBearing): boolean {
	return !isActiveResident(resident);
}

/**
 * In-memory filter, for the several queries that already load every resident
 * and then partition them by location in TypeScript.
 */
export function onlyActiveResidents<T extends StatusBearing>(rows: T[]): T[] {
	return rows.filter(isActiveResident);
}

export interface ResidentStatusFields {
	status?: string | null;
	inactiveReason?: string | null;
	inactiveDate?: string | null;
	placementDate?: string | Date | null;
}

export type ResidentStatusTone =
	| 'active'
	| 'deceased'
	| 'terminated'
	| 'discharged'
	| 'inactive';

const REASON_BADGE: Record<InactiveReason, {label: string; tone: ResidentStatusTone}> = {
	deceased: {label: 'Deceased', tone: 'deceased'},
	placement_terminated: {label: 'Terminated', tone: 'terminated'},
	discharged: {label: 'Discharged', tone: 'discharged'},
};

// How the leaving date reads in a sentence, e.g. "Deceased on Sep 3, 2026".
const REASON_PHRASE: Record<InactiveReason, string> = {
	deceased: 'Deceased',
	placement_terminated: 'Placement terminated',
	discharged: 'Discharged',
};

function isInactiveReason(value: unknown): value is InactiveReason {
	return (INACTIVE_REASONS as readonly unknown[]).includes(value);
}

/**
 * Formats a calendar date for display. Accepts a plain YYYY-MM-DD string or a
 * timestamp. Placement dates are saved as UTC midnight from a date input, so
 * the calendar day is read from the UTC part of the timestamp; otherwise a
 * US time zone would show the day before.
 */
export function formatResidentDate(value: string | Date | null | undefined) {
	if (!value) return null;
	const iso = value instanceof Date ? value.toISOString() : value;
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
	if (!match) return null;
	const [, year, month, day] = match;
	const local = new Date(Number(year), Number(month) - 1, Number(day));
	if (Number.isNaN(local.getTime())) return null;
	return local.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

export function residentStatusBadge(resident: ResidentStatusFields) {
	if (isActiveResident(resident)) {
		return {label: 'Active', tone: 'active' as ResidentStatusTone};
	}
	if (isInactiveReason(resident.inactiveReason)) {
		return REASON_BADGE[resident.inactiveReason];
	}
	return {label: 'Inactive', tone: 'inactive' as ResidentStatusTone};
}

/** The sentence shown when someone clicks a resident's status badge. */
export function residentStatusDetail(resident: ResidentStatusFields) {
	if (isActiveResident(resident)) {
		const since = formatResidentDate(resident.placementDate);
		return since ? `Active since ${since}` : 'Active (no placement date on file)';
	}

	const phrase = isInactiveReason(resident.inactiveReason)
		? REASON_PHRASE[resident.inactiveReason]
		: 'Inactive';
	const on = formatResidentDate(resident.inactiveDate);
	return on ? `${phrase} on ${on}` : `${phrase} (date not recorded)`;
}

/** Label for the leaving-date input on the profile form. */
export function inactiveDateLabel(reason: string | null | undefined) {
	switch (reason) {
		case 'deceased':
			return 'Date of Death';
		case 'placement_terminated':
			return 'Termination Date';
		case 'discharged':
			return 'Discharge Date';
		default:
			return 'Inactive Since';
	}
}
