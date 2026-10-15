// src/app/api/care/blood-glucose-logs/[id]/route.ts
//
// PATCH {reason, ...fields} -- the author within 30 minutes, or any
// supervisor/admin at the resident's location. The previous values are kept
// as a revision; nothing is overwritten without a trace.

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {updateGlucoseLog} from '@/db/mutations/blood-glucose-logs';
import {NO_STORE, glucoseErrorResponse} from '../errors';

export async function PATCH(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
	}

	try {
		const {id} = await params;
		const updated = await updateGlucoseLog(userId, id, body);
		return NextResponse.json(updated, {headers: NO_STORE});
	} catch (error) {
		return glucoseErrorResponse(error, 'Error updating blood sugar log:');
	}
}
