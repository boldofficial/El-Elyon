// src/app/api/care/tasks/[id]/complete/route.ts
//
// POST {note?} -> marks the task done.
//
// A home task can be completed by anyone who can see it; a task tagged to a
// named person only by that person, or a supervisor/admin on their behalf.

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {completeTask} from '@/db/mutations/tasks';
import {NO_STORE, readJsonObject, taskErrorResponse} from '../../_shared';

export async function POST(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	// The body is optional: completing without a note sends nothing.
	const body = (await readJsonObject(request)) ?? {};

	try {
		const {id} = await params;
		const result = await completeTask(userId, id, body.note);
		return NextResponse.json(result, {headers: NO_STORE});
	} catch (error) {
		return taskErrorResponse(error, 'Error completing task:');
	}
}
