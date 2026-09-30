// db/queries/care-log-report.ts
//
// Loads every activity log recorded at one location over an inclusive
// local-date range, for the printable report handed to state inspectors.
//
// Logs store the location by NAME, so a location that was renamed has older
// logs under its legacy names; those are included. The query refuses a range
// that holds more than MAX_REPORT_ENTRIES rather than returning a partial
// report that could read as complete.

import {db} from '../index';
import {employees, locations, residentLogs} from '../schema';
import {and, eq, gte, inArray, lt, sql} from 'drizzle-orm';
import {listLocationAliases} from './life-safety';
import {getOperationalTimeZone} from './care';
import {computeOperationalDate} from '@/lib/operational-time';
import {
	MAX_REPORT_ENTRIES,
	reportWindowUtc,
	type CareLogReport,
} from '@/lib/care-log-report';

export class CareLogReportScopeError extends Error {
	constructor() {
		super('Location not found');
		this.name = 'CareLogReportScopeError';
	}
}

export class CareLogReportTooLargeError extends Error {
	constructor() {
		super(
			`This range has more than ${MAX_REPORT_ENTRIES} log entries. Choose a shorter date range.`
		);
		this.name = 'CareLogReportTooLargeError';
	}
}

export async function getCareLogReport(
	locationId: string,
	range: {from: string; to: string}
): Promise<CareLogReport> {
	const location = await db.query.locations.findFirst({
		where: eq(locations.id, locationId),
	});
	if (!location) throw new CareLogReportScopeError();

	// null means a legacy name is shared with another location; reading by
	// name would then leak that location's logs, so fail closed.
	const aliases = await listLocationAliases(location.id);
	if (aliases === null) throw new CareLogReportScopeError();
	const locationNames = Array.from(new Set([location.name, ...aliases]));

	const timeZone = await getOperationalTimeZone();
	const {start, endExclusive} = reportWindowUtc(range, timeZone);
	const loggedAt = sql`coalesce(${residentLogs.timestamp}, ${residentLogs.createdAt})`;

	const logs = await db.query.residentLogs.findMany({
		where: and(
			inArray(residentLogs.location, locationNames),
			gte(loggedAt, start),
			lt(loggedAt, endExclusive)
		),
		limit: MAX_REPORT_ENTRIES + 1,
		with: {
			resident: {columns: {name: true}},
			activities: {
				orderBy: (activities, {asc}) => [asc(activities.timestamp)],
			},
		},
	});
	if (logs.length > MAX_REPORT_ENTRIES) throw new CareLogReportTooLargeError();

	// Older logs may carry only the author's Clerk ID.
	const unnamedAuthorIds = Array.from(
		new Set(
			logs
				.filter((log) => !log.authorName && log.authorId)
				.map((log) => log.authorId as string)
		)
	);
	const authorNames = new Map<string, string>();
	if (unnamedAuthorIds.length > 0) {
		const rows = await db
			.select({
				clerkUserId: employees.clerkUserId,
				name: employees.name,
				workEmail: employees.workEmail,
			})
			.from(employees)
			.where(inArray(employees.clerkUserId, unnamedAuthorIds));
		for (const row of rows) {
			const name = row.name || row.workEmail;
			if (row.clerkUserId && name) authorNames.set(row.clerkUserId, name);
		}
	}

	const entries = logs
		.map((log) => {
			const at = (log.timestamp ?? log.createdAt) as Date;
			return {
				id: log.id,
				residentId: log.residentId,
				residentName: log.resident?.name ?? 'Unknown resident',
				loggedAt: at.toISOString(),
				loggedDate: computeOperationalDate(at, timeZone),
				authorName:
					log.authorName ||
					(log.authorId ? authorNames.get(log.authorId) : undefined) ||
					null,
				logType: log.logType,
				template: log.template,
				content: log.content,
				activities: log.activities.map((activity) => ({
					activityType: activity.activityType,
					completed: activity.completed,
					notes: activity.notes,
				})),
			};
		})
		.sort((a, b) => a.loggedAt.localeCompare(b.loggedAt) || a.id.localeCompare(b.id));

	return {
		location: location.name,
		from: range.from,
		to: range.to,
		timeZone,
		generatedAt: new Date().toISOString(),
		entries,
	};
}
