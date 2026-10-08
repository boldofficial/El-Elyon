import {auth} from '@clerk/nextjs/server';
import {AccessDeniedError, logAudit, requireAdminOrPrivilege} from '@/lib/db-helpers';
import {
	CareLogReportScopeError,
	CareLogReportTooLargeError,
	getCareLogReport,
} from '@/db/queries/care-log-report';
import {createAdminCareLogReportHandler} from './handler';

export const GET = createAdminCareLogReportHandler({
	getUserId: async () => (await auth()).userId,
	requireAdminOrPrivilege,
	isAccessDenied: (error) => error instanceof AccessDeniedError,
	getReport: getCareLogReport,
	audit: ({userId, location, from, to, entryCount}) =>
		logAudit({
			clerkUserId: userId,
			event: 'care_log_report.generated',
			details: `Activity log report ${from} to ${to} (${entryCount} entries)`,
			deviceId: 'system',
			location,
		}),
	describeError: (error) => {
		if (error instanceof CareLogReportTooLargeError) {
			return {status: 422, message: error.message};
		}
		if (error instanceof CareLogReportScopeError) {
			return {status: 404, message: 'Location not found'};
		}
		return null;
	},
});
