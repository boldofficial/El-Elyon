// src/app/api/care/blood-glucose-logs/[id]/revisions/route.ts
//
// GET -> {revisions} -- the edit history of one entry, newest first.

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {getGlucoseLogRevisions} from '@/db/queries/blood-glucose-logs';
import {NO_STORE, glucoseErrorResponse} from '../../errors';

export async function GET(
	_request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const {id} = await params;
		const revisions = await getGlucoseLogRevisions(userId, id);
		return NextResponse.json({revisions}, {headers: NO_STORE});
	} catch (error) {
		return glucoseErrorResponse(error, 'Error fetching blood sugar log history:');
	}
}
