// src/app/api/inspector/water-temperature/handler.ts
//
// Read-only water-temperature month endpoint for a live OTP inspector session
// (U6 / R15-R16, R18).
//
// The handler is factored out of route.ts for the same reason the life-safety
// one is (src/app/api/inspector/life-safety/handler.ts): route.ts pulls in the
// database client at import time, so the boundary itself is tested here
// through injected dependencies.
//
// Scope rules enforced below:
//   * The house comes exclusively from the validated, live, non-revoked
//     session. Query parameters, request bodies, and headers naming a house
//     are never read -- there is no code path that can widen or change scope.
//   * A missing, expired, revoked, malformed, or locationless session fails
//     with 401 BEFORE any water-temperature query runs.
//   * Only the month/year selectors are accepted from the client, and they are
//     validated before the query.
//   * Every response is `private, no-store`. The service worker already
//     refuses to intercept `/api/` requests (public/sw.js), so these responses
//     stay out of shared browser and service-worker caches.
//   * Errors log a message only. Session tokens, cookies, and headers are
//     never logged.

import {NextResponse} from 'next/server';
import {
	InspectorWaterTemperatureScopeError,
	isValidInspectorReportMonth,
	isValidInspectorReportYear,
} from '@/lib/inspector-water-temperature-projection';

const privateNoStore = {'Cache-Control': 'private, no-store'};

export type InspectorWaterTemperatureDependencies = {
	getSession: (request: Request) => Promise<{locationId: string} | null>;
	getData: (locationId: string, year: number, month: number) => Promise<unknown>;
};

export function createInspectorWaterTemperatureHandler(
	dependencies: InspectorWaterTemperatureDependencies
) {
	return async function inspectorWaterTemperatureHandler(request: Request) {
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
		const year = Number(parameters.get('year'));
		const month = Number(parameters.get('month'));
		if (!isValidInspectorReportYear(year) || !isValidInspectorReportMonth(month)) {
			return NextResponse.json(
				{error: 'A valid month and year are required'},
				{status: 400, headers: privateNoStore}
			);
		}

		try {
			// Scope is derived exclusively from the validated live session. Client
			// query parameters, bodies, and headers naming a house are ignored.
			const data = await dependencies.getData(session.locationId, year, month);
			return NextResponse.json(data, {headers: privateNoStore});
		} catch (error) {
			if (error instanceof InspectorWaterTemperatureScopeError) {
				return NextResponse.json(
					{error: 'Water temperature records unavailable'},
					{status: 404, headers: privateNoStore}
				);
			}
			console.error(
				'Inspector water-temperature query failed',
				error instanceof Error ? error.message : 'Unknown error'
			);
			return NextResponse.json(
				{error: 'Failed to load water temperature records'},
				{status: 500, headers: privateNoStore}
			);
		}
	};
}
