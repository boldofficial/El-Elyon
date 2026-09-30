// src/app/api/inspector/care-log-report/handler.ts
//
// Printable activity-log report for a live OTP inspector session. Factored out
// of route.ts (like the water-temperature handler) so the scope boundary is
// tested without a database.
//
// Scope rules:
//   * The location comes only from the validated session. Query parameters
//     naming a location are never read.
//   * No session -> 401 before any query runs.
//   * Only `from` / `to` are accepted from the client, validated first.
//   * Responses are `private, no-store`.
//   * Each generated report is audit-logged, since it is a disclosure of
//     resident records.

import {NextResponse} from 'next/server';
import {parseReportRange} from '@/lib/care-log-report';

const privateNoStore = {'Cache-Control': 'private, no-store'};

export type InspectorCareLogReportSession = {
	accessId: string;
	locationId: string;
	location: string;
};

export type InspectorCareLogReportDependencies = {
	getSession: (request: Request) => Promise<InspectorCareLogReportSession | null>;
	getReport: (
		locationId: string,
		range: {from: string; to: string}
	) => Promise<{entries: unknown[]}>;
	audit: (event: {
		session: InspectorCareLogReportSession;
		from: string;
		to: string;
		entryCount: number;
	}) => Promise<void>;
	/** Maps a query error to a client-safe response, or null for a 500. */
	describeError?: (error: unknown) => {status: number; message: string} | null;
};

export function createInspectorCareLogReportHandler(
	dependencies: InspectorCareLogReportDependencies
) {
	return async function inspectorCareLogReportHandler(request: Request) {
		const session = await dependencies.getSession(request);
		if (
			!session ||
			typeof session.locationId !== 'string' ||
			session.locationId.trim().length === 0
		) {
			return NextResponse.json(
				{error: 'No active session'},
				{status: 401, headers: privateNoStore}
			);
		}

		const parameters = new URL(request.url).searchParams;
		const range = parseReportRange(parameters.get('from'), parameters.get('to'));
		if (!range.ok) {
			return NextResponse.json(
				{error: range.error},
				{status: 400, headers: privateNoStore}
			);
		}

		try {
			const report = await dependencies.getReport(session.locationId, {
				from: range.from,
				to: range.to,
			});
			await dependencies.audit({
				session,
				from: range.from,
				to: range.to,
				entryCount: report.entries.length,
			});
			return NextResponse.json(report, {headers: privateNoStore});
		} catch (error) {
			const described = dependencies.describeError?.(error);
			if (described) {
				return NextResponse.json(
					{error: described.message},
					{status: described.status, headers: privateNoStore}
				);
			}
			console.error(
				'Inspector care-log report failed',
				error instanceof Error ? error.message : 'Unknown error'
			);
			return NextResponse.json(
				{error: 'Failed to build the report'},
				{status: 500, headers: privateNoStore}
			);
		}
	};
}
