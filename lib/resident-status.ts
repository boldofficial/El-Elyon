// Shared wording for a resident's status: the badge on the resident list and
// the leaving-date field on the admin profile both read from here so they
// always agree.

export type InactiveReason = 'deceased' | 'placement_terminated' | 'discharged';

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
	return (
		value === 'deceased' ||
		value === 'placement_terminated' ||
		value === 'discharged'
	);
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
	if ((resident.status ?? 'active') !== 'inactive') {
		return {label: 'Active', tone: 'active' as ResidentStatusTone};
	}
	if (isInactiveReason(resident.inactiveReason)) {
		return REASON_BADGE[resident.inactiveReason];
	}
	return {label: 'Inactive', tone: 'inactive' as ResidentStatusTone};
}

/** The sentence shown when someone clicks a resident's status badge. */
export function residentStatusDetail(resident: ResidentStatusFields) {
	if ((resident.status ?? 'active') !== 'inactive') {
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
