// src/app/api/care/tasks/[id]/route.ts
//
// PATCH {action: 'cancel'}            -> cancels the task
// PATCH {title?, kind?, dueDate?, …}  -> edits the task
//
// Staff may edit or cancel only a task they created, and only before it is
// overdue; supervisors and admins may at any time within their homes.

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {cancelTask, updateTask} from '@/db/mutations/tasks';
import {NO_STORE, readJsonObject, taskErrorResponse} from '../_shared';

export async function PATCH(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	const body = await readJsonObject(request);
	if (!body) {
		return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
	}

	try {
		const {id} = await params;
		const result =
			body.action === 'cancel'
				? await cancelTask(userId, id)
				: await updateTask(userId, id, body);
		return NextResponse.json(result, {headers: NO_STORE});
	} catch (error) {
		return taskErrorResponse(error, 'Error updating task:');
	}
}
