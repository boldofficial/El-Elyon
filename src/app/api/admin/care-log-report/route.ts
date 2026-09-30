// src/app/api/admin/care-log-report/route.ts
// Admin: every activity log for one location over a date range, for the
// printable report sent to state inspectors. Each report is audit-logged.

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {AccessDeniedError, logAudit, requireAdminAccess} from '@/lib/db-helpers';
import {parseReportRange} from '@/lib/care-log-report';
import {
	CareLogReportScopeError,
	CareLogReportTooLargeError,
	getCareLogReport,
} from '@/db/queries/care-log-report';

const privateNoStore = {'Cache-Control': 'private, no-store'};

export async function GET(req: NextRequest) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const params = req.nextUrl.searchParams;
		const locationId = params.get('locationId');
		if (!locationId) {
			return NextResponse.json({error: 'Choose a location'}, {status: 400});
		}
		const range = parseReportRange(params.get('from'), params.get('to'));
		if (!range.ok) {
			return NextResponse.json({error: range.error}, {status: 400});
		}

		const report = await getCareLogReport(locationId, range);
		await logAudit({
			clerkUserId: userId,
			event: 'care_log_report.generated',
			details: `Activity log report ${range.from} to ${range.to} (${report.entries.length} entries)`,
			deviceId: 'system',
			location: report.location,
		});
		return NextResponse.json(report, {headers: privateNoStore});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		if (error instanceof CareLogReportTooLargeError) {
			return NextResponse.json({error: error.message}, {status: 422});
		}
		if (error instanceof CareLogReportScopeError) {
			return NextResponse.json({error: 'Location not found'}, {status: 404});
		}
		console.error('Care log report error:', error);
		return NextResponse.json({error: 'Failed to build the report'}, {status: 500});
	}
}
