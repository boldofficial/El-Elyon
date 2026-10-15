// src/app/api/care/blood-glucose-logs/[id]/review/route.ts
//
// POST {comment?} -- supervisor/admin sign-off on an entry.

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {reviewGlucoseLog} from '@/db/mutations/blood-glucose-logs';
import {NO_STORE, glucoseErrorResponse} from '../../errors';

export async function POST(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	let body: Record<string, unknown> = {};
	try {
		body = await request.json();
	} catch {
		// An empty body is a review without a comment.
	}

	try {
		const {id} = await params;
		const updated = await reviewGlucoseLog(userId, id, {comment: body.comment});
		return NextResponse.json(updated, {headers: NO_STORE});
	} catch (error) {
		return glucoseErrorResponse(error, 'Error reviewing blood sugar log:');
	}
}
