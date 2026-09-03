import {NextResponse} from 'next/server';
import {InspectorLifeSafetyScopeError} from '@/lib/inspector-life-safety-projection';

const privateNoStore = {'Cache-Control': 'private, no-store'};

export type InspectorLifeSafetyDependencies = {
	getSession: (request: Request) => Promise<{locationId: string} | null>;
	getData: (locationId: string) => Promise<unknown>;
};

export function createInspectorLifeSafetyHandler(
	dependencies: InspectorLifeSafetyDependencies
) {
	return async function inspectorLifeSafetyHandler(request: Request) {
		const session = await dependencies.getSession(request);
		if (!session) {
			return NextResponse.json(
				{error: 'No active session'},
				{status: 401, headers: privateNoStore}
			);
		}

		try {
			// Scope is derived exclusively from the validated live session. Client
			// query parameters and headers are intentionally ignored.
			const data = await dependencies.getData(session.locationId);
			return NextResponse.json(data, {headers: privateNoStore});
		} catch (error) {
			if (error instanceof InspectorLifeSafetyScopeError) {
				return NextResponse.json(
					{error: 'Life-safety records unavailable'},
					{status: 404, headers: privateNoStore}
				);
			}
			console.error(
				'Inspector life-safety query failed',
				error instanceof Error ? error.message : 'Unknown error'
			);
			return NextResponse.json(
				{error: 'Failed to load life-safety records'},
				{status: 500, headers: privateNoStore}
			);
		}
	};
}
