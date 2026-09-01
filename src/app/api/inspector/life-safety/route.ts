import {NextResponse} from 'next/server';
import {getInspectorLifeSafetyData} from '@/db/queries/inspector';
import {getInspectorSession} from '@/lib/inspector-auth';
import {InspectorLifeSafetyScopeError} from '@/lib/inspector-life-safety-projection';

const privateNoStore = {'Cache-Control': 'private, no-store'};

export async function GET(request: Request) {
	const session = await getInspectorSession(request);
	if (!session) {
		return NextResponse.json({error: 'No active session'}, {status: 401, headers: privateNoStore});
	}

	try {
		// Scope is derived exclusively from the validated live session. Client
		// query parameters, headers, and bodies are intentionally ignored.
		const data = await getInspectorLifeSafetyData(session.locationId);
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
}
