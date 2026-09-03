// src/app/api/inspector/session/route.ts
// Returns the current inspector session (location + expiry) or 401.

import {NextResponse} from 'next/server';
import {getInspectorSession} from '@/lib/inspector-auth';

export async function GET(req: Request) {
	const session = await getInspectorSession(req);
	if (!session) {
		return NextResponse.json({error: 'No active session'}, {status: 401});
	}
	return NextResponse.json({
		locationId: session.locationId,
		location: session.location,
		label: session.label,
		expiresAt: session.expiresAt,
	});
}
