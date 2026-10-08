// src/app/api/admin/care-log-report/handler.ts
//
// Staff-side activity-log report: every log for one location over a date
// range, for the printable report sent to state inspectors. Factored out of
// route.ts so the permission rule is tested without Clerk or a database.
//
// Who may generate it: admins, and anyone granted the "View Care Logs &
// Incidents" privilege (`view_care_logs`), for any location -- the same people
// who can already read these logs on the Care Logs screen. Every generated
// report is audit-logged with the requesting user.

import {NextResponse} from 'next/server';
import type {AdminPrivilege} from '@/lib/admin-privileges';
import {parseReportRange} from '@/lib/care-log-report';

const privateNoStore = {'Cache-Control': 'private, no-store'};

export const CARE_LOG_REPORT_PRIVILEGE: AdminPrivilege = 'view_care_logs';

export type AdminCareLogReportDependencies = {
	getUserId: () => Promise<string | null>;
	/** Resolves for an admin or a holder of `privilege`; throws otherwise. */
	requireAdminOrPrivilege: (userId: string, privilege: AdminPrivilege) => Promise<unknown>;
	/** True for the error requireAdminOrPrivilege throws on denial. */
	isAccessDenied: (error: unknown) => boolean;
	getReport: (
		locationId: string,
		range: {from: string; to: string}
	) => Promise<{location: string; entries: unknown[]}>;
	audit: (event: {
		userId: string;
		location: string;
		from: string;
		to: string;
		entryCount: number;
	}) => Promise<void>;
	/** Maps a query error to a client-safe response, or null for a 500. */
	describeError?: (error: unknown) => {status: number; message: string} | null;
};

export function createAdminCareLogReportHandler(
	dependencies: AdminCareLogReportDependencies
) {
	return async function adminCareLogReportHandler(request: Request) {
		const userId = await dependencies.getUserId();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		try {
			await dependencies.requireAdminOrPrivilege(userId, CARE_LOG_REPORT_PRIVILEGE);

			const params = new URL(request.url).searchParams;
			const locationId = params.get('locationId');
			if (!locationId) {
				return NextResponse.json({error: 'Choose a location'}, {status: 400});
			}
			const range = parseReportRange(params.get('from'), params.get('to'));
			if (!range.ok) {
				return NextResponse.json({error: range.error}, {status: 400});
			}

			const report = await dependencies.getReport(locationId, {
				from: range.from,
				to: range.to,
			});
			await dependencies.audit({
				userId,
				location: report.location,
				from: range.from,
				to: range.to,
				entryCount: report.entries.length,
			});
			return NextResponse.json(report, {headers: privateNoStore});
		} catch (error) {
			if (dependencies.isAccessDenied(error)) {
				return NextResponse.json(
					{error: 'You need the "View Care Logs & Incidents" permission to print this report'},
					{status: 403}
				);
			}
			const described = dependencies.describeError?.(error);
			if (described) {
				return NextResponse.json({error: described.message}, {status: described.status});
			}
			console.error(
				'Care log report failed',
				error instanceof Error ? error.message : 'Unknown error'
			);
			return NextResponse.json({error: 'Failed to build the report'}, {status: 500});
		}
	};
}
