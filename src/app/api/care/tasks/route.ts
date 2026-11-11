// src/app/api/care/tasks/route.ts
//
// Tasks hub: one-off, non-routine work for a home.
//   GET  ?view=open|history&location=&kind=&residentId=  -> {today, tasks}
//   GET  ?alerts=1               -> {overdueTasks, tasksDueToday}  (banner + feed)
//   GET  ?meta=1                 -> {role, locations}  (homes the caller can use)
//   GET  ?optionsFor=<location>  -> {assignees, residents}  (pickers for one home)
//   POST {kind, title, location, dueDate, dueTime?, description?, residentId?,
//         assignedStaffId?, visibility?}  -> the created task
//
// Location scope and per-task visibility are enforced in db/queries/tasks.ts
// and db/mutations/tasks.ts, not here.

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {
	getTaskAlertsForUser,
	getTaskFormMeta,
	getTaskHomeOptions,
	getTasksForScope,
} from '@/db/queries/tasks';
import {createTask} from '@/db/mutations/tasks';
import {NO_STORE, readJsonObject, taskErrorResponse} from './_shared';

export async function GET(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	const {searchParams} = new URL(request.url);

	if (searchParams.get('alerts')) {
		try {
			return NextResponse.json(await getTaskAlertsForUser(userId), {headers: NO_STORE});
		} catch (error) {
			return taskErrorResponse(error, 'Error fetching task alerts:');
		}
	}

	if (searchParams.get('meta')) {
		try {
			return NextResponse.json(await getTaskFormMeta(userId), {headers: NO_STORE});
		} catch (error) {
			return taskErrorResponse(error, 'Error fetching task form options:');
		}
	}

	const optionsFor = searchParams.get('optionsFor');
	if (optionsFor) {
		try {
			return NextResponse.json(await getTaskHomeOptions(userId, optionsFor), {
				headers: NO_STORE,
			});
		} catch (error) {
			return taskErrorResponse(error, 'Error fetching task pickers:');
		}
	}

	try {
		const result = await getTasksForScope(userId, {
			view: searchParams.get('view') === 'history' ? 'history' : 'open',
			location: searchParams.get('location') ?? undefined,
			kind: searchParams.get('kind') ?? undefined,
			residentId: searchParams.get('residentId') ?? undefined,
		});
		return NextResponse.json(result, {headers: NO_STORE});
	} catch (error) {
		return taskErrorResponse(error, 'Error fetching tasks:');
	}
}

export async function POST(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	const body = await readJsonObject(request);
	if (!body) {
		return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
	}

	try {
		const created = await createTask(userId, body);
		return NextResponse.json(created, {status: 201, headers: NO_STORE});
	} catch (error) {
		return taskErrorResponse(error, 'Error creating task:');
	}
}
