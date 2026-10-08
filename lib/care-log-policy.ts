/**
 * Time rules for care (activity) logs: how long the author may edit a log,
 * and how far back a forgotten log may be entered late.
 *
 * Free of database/server imports so the same rules run server-side (the
 * enforcement points: `/api/care/create-log`, `/api/care/resident-logs/[logId]`)
 * and client-side (to decide which controls to render).
 *
 * A late entry keeps two dates apart:
 *   - `loggedForDate`: the organization-local day the care happened, chosen
 *     by the staff member;
 *   - `createdAt`: when it was actually typed in, never backdated.
 * Every display and printout shows both, so nobody has to infer a late entry
 * from timestamps.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/** How long after submission the author may still edit their log. */
export const CARE_LOG_EDIT_WINDOW_DAYS = 14;
export const CARE_LOG_EDIT_WINDOW_MS = CARE_LOG_EDIT_WINDOW_DAYS * DAY_MS;

/** How many days back a forgotten log may be entered. */
export const LATE_ENTRY_MAX_DAYS = 14;

/** Longest accepted "why is this late" note. */
export const LATE_ENTRY_REASON_MAX_LENGTH = 500;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** True for a real calendar date written as YYYY-MM-DD. */
export function isCalendarDate(value: unknown): value is string {
	if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return (
		date.getUTCFullYear() === y &&
		date.getUTCMonth() === m - 1 &&
		date.getUTCDate() === d
	);
}

/** Whole calendar days from `from` to `to` (both YYYY-MM-DD); negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	const [fy, fm, fd] = from.split('-').map(Number);
	const [ty, tm, td] = to.split('-').map(Number);
	return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/** YYYY-MM-DD for `days` after `isoDate` (negative for before). */
export function shiftDate(isoDate: string, days: number): string {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Returns true when the author may still edit a log submitted at `createdAt`.
 * Measured from submission, not from the day the log is for, so a late entry
 * gets the same full window as any other log. A log with no usable
 * submission time is treated as not editable: refuse rather than guess.
 */
export function isWithinCareLogEditWindow(
	createdAt: Date | string | null | undefined,
	now: Date = new Date()
): boolean {
	if (!createdAt) return false;
	const submitted = new Date(createdAt).getTime();
	if (Number.isNaN(submitted)) return false;
	return now.getTime() - submitted <= CARE_LOG_EDIT_WINDOW_MS;
}

/**
 * Checks the day a staff member says a late log is for.
 *
 * @param loggedForDate the day chosen in the form (YYYY-MM-DD, unvalidated input)
 * @param today today's date in the organization's operational timezone (YYYY-MM-DD)
 * @returns null when the day is allowed, otherwise a message to show the staff member
 */
export function lateEntryDateError(loggedForDate: unknown, today: string): string | null {
	if (!isCalendarDate(loggedForDate)) {
		return 'Choose the day this log is for';
	}

	// 1 = yesterday. Counting back from today, day LATE_ENTRY_MAX_DAYS is the
	// last allowed day: on Sept 30, Sept 16 (day 14) is allowed, Sept 15 is not.
	const daysBack = daysBetween(loggedForDate, today);
	if (daysBack < 1) {
		return 'A late entry must be for an earlier day. For today, log it normally.';
	}
	if (daysBack > LATE_ENTRY_MAX_DAYS) {
		return `Late entries can only go back ${LATE_ENTRY_MAX_DAYS} days.`;
	}
	return null;
}

/** "Sep 20, 2026" for a YYYY-MM-DD day, independent of the viewer's timezone. */
export function formatLoggedForDate(isoDate: string): string {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
		timeZone: 'UTC',
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}
