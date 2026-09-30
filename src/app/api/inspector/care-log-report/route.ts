import {getInspectorSession} from '@/lib/inspector-auth';
import {logAudit} from '@/lib/db-helpers';
import {
	CareLogReportScopeError,
	CareLogReportTooLargeError,
	getCareLogReport,
} from '@/db/queries/care-log-report';
import {createInspectorCareLogReportHandler} from './handler';

export const GET = createInspectorCareLogReportHandler({
	getSession: getInspectorSession,
	getReport: getCareLogReport,
	audit: ({session, from, to, entryCount}) =>
		logAudit({
			clerkUserId: null,
			event: 'inspector.care_log_report',
			details: `Inspector generated activity log report ${from} to ${to} (${entryCount} entries, access ${session.accessId})`,
			deviceId: 'inspector',
			location: session.location,
		}),
	describeError: (error) => {
		if (error instanceof CareLogReportTooLargeError) {
			return {status: 422, message: error.message};
		}
		if (error instanceof CareLogReportScopeError) {
			return {status: 404, message: 'Activity logs unavailable'};
		}
		return null;
	},
});
