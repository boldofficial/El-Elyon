// src/app/api/inspector/overview/route.ts
// Read-only aggregate of a location's compliance data for the inspector.

import {NextResponse} from 'next/server';
import {getInspectorSession} from '@/lib/inspector-auth';
import {getInspectorLocationData} from '@/db/queries/inspector';

export async function GET(req: Request) {
	const session = await getInspectorSession(req);
	if (!session) {
		return NextResponse.json({error: 'No active session'}, {status: 401});
	}

	try {
		const data = await getInspectorLocationData(session.location);
		return NextResponse.json(data);
	} catch (error: any) {
		console.error('Inspector overview error:', error);
		return NextResponse.json({error: 'Failed to load data'}, {status: 500});
	}
}
