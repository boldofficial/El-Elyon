// lib/care-log-report.ts
//
// Pure helpers for the printable activity-log report that admins (and the
// state-inspector dashboard) hand to inspectors. The report is a complete,
// date-ranged record for one location, so the rules here are about never
// silently dropping rows:
//   * the range is inclusive calendar days in the organization's operational
//     timezone, not the browser's or the database host's;
//   * the range is capped in days, and the query refuses (rather than
//     truncates) when a range holds more entries than one printout can carry.

export const MAX_REPORT_DAYS = 366;
export const MAX_REPORT_ENTRIES = 5000;
/** Rows in the inspector dashboard's on-screen "recent logs" list. */
export const INSPECTOR_RECENT_LOG_LIMIT = 500;

export interface CareLogReportActivity {
	activityType: string;
	completed: boolean;
	notes: string | null;
}

export interface CareLogReportEntry {
	id: string;
	residentId: string;
	residentName: string;
	/** ISO instant the log was recorded (for a late entry, when it was typed in). */
	loggedAt: string;
	/**
	 * Day (YYYY-MM-DD) the entry belongs to: loggedForDate for a late entry,
	 * otherwise the date of loggedAt in the report's timezone.
	 */
	loggedDate: string;
	/** Set only on a late entry: the day the care happened. */
	loggedForDate: string | null;
	lateEntryReason: string | null;
	authorName: string | null;
	logType: string | null;
	template: string | null;
	content: string | null;
	activities: CareLogReportActivity[];
}

export interface CareLogReport {
	location: string;
	/** Inclusive YYYY-MM-DD range. */
	from: string;
	to: string;
	timeZone: string;
	/** ISO instant the report data was read. */
	generatedAt: string;
	/** Sorted by loggedDate, then loggedAt. */
	entries: CareLogReportEntry[];
}

export type ReportRangeResult =
	| {ok: true; from: string; to: string}
	| {ok: false; error: string};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isCalendarDate(value: string): boolean {
	if (!ISO_DATE.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return (
		date.getUTCFullYear() === y &&
		date.getUTCMonth() === m - 1 &&
		date.getUTCDate() === d
	);
}

export function addDays(isoDate: string, days: number): string {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daySpan(from: string, to: string): number {
	const [fy, fm, fd] = from.split('-').map(Number);
	const [ty, tm, td] = to.split('-').map(Number);
	return (Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000 + 1;
}

export function parseReportRange(
	from: string | null | undefined,
	to: string | null | undefined
): ReportRangeResult {
	if (!from || !to || !isCalendarDate(from) || !isCalendarDate(to)) {
		return {ok: false, error: 'Choose a valid start and end date'};
	}
	if (from > to) {
		return {ok: false, error: 'The start date must be on or before the end date'};
	}
	if (daySpan(from, to) > MAX_REPORT_DAYS) {
		return {
			ok: false,
			error: `A report can cover at most ${MAX_REPORT_DAYS} days`,
		};
	}
	return {ok: true, from, to};
}

// Milliseconds the zone is ahead of UTC at `instant` (negative west of UTC).
function zoneOffsetMs(instant: Date, timeZone: string): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(instant);
	const get = (type: Intl.DateTimeFormatPartTypes) =>
		Number(parts.find((part) => part.type === type)?.value);
	const asUtc = Date.UTC(
		get('year'),
		get('month') - 1,
		get('day'),
		get('hour'),
		get('minute'),
		get('second')
	);
	return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** The UTC instant at which `isoDate` begins (local midnight) in `timeZone`. */
export function localDayStartUtc(isoDate: string, timeZone: string): Date {
	return localDateTimeUtc(isoDate, '00:00', timeZone);
}

/** The UTC instant of wall-clock `time` (`HH:MM`) on `isoDate` in `timeZone`. */
export function localDateTimeUtc(isoDate: string, time: string, timeZone: string): Date {
	const [y, m, d] = isoDate.split('-').map(Number);
	const [hours, minutes] = time.split(':').map(Number);
	const guess = Date.UTC(y, m - 1, d, hours, minutes);
	const first = guess - zoneOffsetMs(new Date(guess), timeZone);
	// Re-check at the candidate: a DST change between the UTC guess and the
	// local time shifts the offset by an hour.
	const second = guess - zoneOffsetMs(new Date(first), timeZone);
	return new Date(second);
}

/** Half-open [start, endExclusive) UTC window covering the inclusive local-day range. */
export function reportWindowUtc(
	range: {from: string; to: string},
	timeZone: string
): {start: Date; endExclusive: Date} {
	return {
		start: localDayStartUtc(range.from, timeZone),
		endExclusive: localDayStartUtc(addDays(range.to, 1), timeZone),
	};
}
