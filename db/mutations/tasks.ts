// db/mutations/tasks.ts
//
// Write side of the tasks hub. The "who may do what" decisions live in
// lib/tasks.ts; this file loads the facts those rules need, checks the things
// only the database knows (does this person work at this home, is this
// resident placed there), and writes.

import {and, eq} from 'drizzle-orm';
import {db} from '../index';
import {employees, locations, residents, tasks} from '../schema';
import {AccessDeniedError, getUserRoleDoc, logAudit} from '@/lib/db-helpers';
import {getClerkUser} from '@/lib/clerk';
import {isInactiveResident} from '@/lib/resident-status';
import {
	TASK_TEXT_MAX,
	TaskValidationError,
	canCompleteTask,
	canEditOrCancelTask,
	canSeeTask,
	validateTaskInput,
	type TaskInput,
	type TaskViewer,
} from '@/lib/tasks';
import {
	loadTaskViewer,
	operationalToday,
	taskFacts,
	toTaskDto,
	type TaskDto,
} from '../queries/tasks';

export {TaskValidationError};

/** The task changed underneath the caller (already done or cancelled). */
export class TaskConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TaskConflictError';
	}
}

type TaskRow = typeof tasks.$inferSelect;

async function resolveStaffName(clerkUserId: string): Promise<string> {
	const employee = await db.query.employees.findFirst({
		where: eq(employees.clerkUserId, clerkUserId),
		columns: {name: true},
	});
	const name = employee?.name?.trim();
	if (name) return name;
	const clerkUser = await getClerkUser(clerkUserId);
	return clerkUser?.name || 'Unknown';
}

async function deny(viewer: TaskViewer, detail: string, location = ''): Promise<never> {
	await logAudit({
		clerkUserId: viewer.clerkUserId,
		event: 'access_denied',
		details: detail,
		deviceId: 'system',
		location,
	});
	throw new AccessDeniedError('Access denied');
}

/**
 * Loads a task the caller is allowed to see. A task that does not exist and
 * one the caller cannot see are both reported as denied, so the 403/404 split
 * cannot be used to probe which task ids are real.
 */
async function loadVisibleTask(viewer: TaskViewer, taskId: string): Promise<TaskRow> {
	const row = await db.query.tasks.findFirst({where: eq(tasks.id, taskId)});
	if (!row || !canSeeTask(viewer, taskFacts(row))) {
		return deny(viewer, `tasks_not_visible_${taskId}`, row?.location);
	}
	return row;
}

async function residentNameFor(residentId: string | null): Promise<string | null> {
	if (!residentId) return null;
	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, residentId),
		columns: {name: true},
	});
	return resident?.name ?? null;
}

/**
 * Database-backed checks shared by create and edit. Returns the assignee's
 * name to snapshot (null when the task is for the whole home).
 */
async function checkTaskAgainstHome(
	viewer: TaskViewer,
	input: TaskInput,
	options: {residentChanged: boolean}
): Promise<string | null> {
	if (viewer.role === 'admin') {
		const home = await db.query.locations.findFirst({
			where: eq(locations.name, input.location),
			columns: {id: true},
		});
		if (!home) throw new TaskValidationError('That home does not exist');
	} else if (!viewer.locations.includes(input.location)) {
		await deny(viewer, 'tasks_write_cross_location', input.location);
	}

	if (input.residentId && options.residentChanged) {
		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, input.residentId),
			columns: {location: true, status: true},
		});
		// Same message for "missing" and "at another home": no probing.
		if (!resident || resident.location !== input.location) {
			throw new TaskValidationError('That resident is not at this home');
		}
		if (isInactiveResident(resident)) {
			throw new TaskValidationError('That resident is no longer active');
		}
	}

	if (!input.assignedStaffId) return null;

	const assignee = await getUserRoleDoc(input.assignedStaffId);
	const assigneeRole = (assignee?.role ?? '').toLowerCase();
	const worksHere =
		assigneeRole === 'admin' || (assignee?.locations ?? []).includes(input.location);
	if (!assignee || !['admin', 'supervisor', 'staff'].includes(assigneeRole) || !worksHere) {
		throw new TaskValidationError('The named person does not work at this home');
	}
	if (input.visibility === 'supervisors' && assigneeRole === 'staff') {
		throw new TaskValidationError(
			'A supervisor-only task cannot be given to a staff member, who would not be able to see it'
		);
	}
	return resolveStaffName(input.assignedStaffId);
}

export async function createTask(
	clerkUserId: string,
	raw: Record<string, unknown>
): Promise<TaskDto> {
	const viewer = await loadTaskViewer(clerkUserId);
	const today = await operationalToday();
	const input = validateTaskInput(raw, {
		creatorRole: viewer.role,
		today,
		requireNotPast: true,
	});
	const assignedName = await checkTaskAgainstHome(viewer, input, {residentChanged: true});

	const [created] = await db
		.insert(tasks)
		.values({
			kind: input.kind,
			title: input.title,
			description: input.description,
			location: input.location,
			residentId: input.residentId,
			assignedStaffId: input.assignedStaffId,
			assignedNameSnapshot: assignedName,
			visibility: input.visibility,
			dueDate: input.dueDate,
			dueTime: input.dueTime,
			createdBy: clerkUserId,
			createdByNameSnapshot: await resolveStaffName(clerkUserId),
		})
		.returning();

	return toTaskDto(created, await residentNameFor(created.residentId), viewer, today);
}

/**
 * Edits an open task. Fields left out of `raw` keep their current value. The
 * home cannot be changed: a task for another home is a different task.
 */
export async function updateTask(
	clerkUserId: string,
	taskId: string,
	raw: Record<string, unknown>
): Promise<TaskDto> {
	const viewer = await loadTaskViewer(clerkUserId);
	const today = await operationalToday();
	const existing = await loadVisibleTask(viewer, taskId);

	if (existing.status !== 'open') {
		throw new TaskConflictError('This task is already closed');
	}
	if (!canEditOrCancelTask(viewer, taskFacts(existing), today)) {
		await deny(viewer, `tasks_edit_denied_${taskId}`, existing.location);
	}
	if (raw.location !== undefined && raw.location !== existing.location) {
		throw new TaskValidationError('A task cannot be moved to another home');
	}

	const pick = (key: string, current: unknown) => (key in raw ? raw[key] : current);
	const dueDateChanged = 'dueDate' in raw && raw.dueDate !== existing.dueDate;
	const input = validateTaskInput(
		{
			kind: pick('kind', existing.kind),
			title: pick('title', existing.title),
			description: pick('description', existing.description),
			location: existing.location,
			residentId: pick('residentId', existing.residentId),
			assignedStaffId: pick('assignedStaffId', existing.assignedStaffId),
			visibility: pick('visibility', existing.visibility),
			dueDate: pick('dueDate', existing.dueDate),
			dueTime: pick('dueTime', existing.dueTime),
		},
		// A date may be left as it is, but not moved to a day already gone.
		{creatorRole: viewer.role, today, requireNotPast: dueDateChanged}
	);
	const assignedName = await checkTaskAgainstHome(viewer, input, {
		residentChanged: input.residentId !== existing.residentId,
	});

	const [updated] = await db
		.update(tasks)
		.set({
			kind: input.kind,
			title: input.title,
			description: input.description,
			residentId: input.residentId,
			assignedStaffId: input.assignedStaffId,
			assignedNameSnapshot: assignedName,
			visibility: input.visibility,
			dueDate: input.dueDate,
			dueTime: input.dueTime,
			updatedAt: new Date(),
			updatedBy: clerkUserId,
		})
		.where(and(eq(tasks.id, taskId), eq(tasks.status, 'open')))
		.returning();
	if (!updated) throw new TaskConflictError('This task is already closed');

	return toTaskDto(updated, await residentNameFor(updated.residentId), viewer, today);
}

export async function completeTask(
	clerkUserId: string,
	taskId: string,
	rawNote?: unknown
): Promise<TaskDto> {
	const viewer = await loadTaskViewer(clerkUserId);
	const today = await operationalToday();
	const existing = await loadVisibleTask(viewer, taskId);

	if (existing.status !== 'open') {
		throw new TaskConflictError('This task is already closed');
	}
	if (!canCompleteTask(viewer, taskFacts(existing))) {
		await deny(viewer, `tasks_complete_denied_${taskId}`, existing.location);
	}

	let note: string | null = null;
	if (rawNote !== undefined && rawNote !== null) {
		if (typeof rawNote !== 'string') throw new TaskValidationError('Note must be text');
		note = rawNote.trim() || null;
		if (note && note.length > TASK_TEXT_MAX) {
			throw new TaskValidationError(`Note must be ${TASK_TEXT_MAX} characters or fewer`);
		}
	}

	// The status guard makes a double tap, or two people finishing the same
	// task at once, write exactly one completion.
	const [updated] = await db
		.update(tasks)
		.set({
			status: 'done',
			completedAt: new Date(),
			completedBy: clerkUserId,
			completedByNameSnapshot: await resolveStaffName(clerkUserId),
			completionNote: note,
		})
		.where(and(eq(tasks.id, taskId), eq(tasks.status, 'open')))
		.returning();
	if (!updated) throw new TaskConflictError('This task is already closed');

	return toTaskDto(updated, await residentNameFor(updated.residentId), viewer, today);
}

export async function cancelTask(clerkUserId: string, taskId: string): Promise<TaskDto> {
	const viewer = await loadTaskViewer(clerkUserId);
	const today = await operationalToday();
	const existing = await loadVisibleTask(viewer, taskId);

	if (existing.status !== 'open') {
		throw new TaskConflictError('This task is already closed');
	}
	if (!canEditOrCancelTask(viewer, taskFacts(existing), today)) {
		await deny(viewer, `tasks_cancel_denied_${taskId}`, existing.location);
	}

	const [updated] = await db
		.update(tasks)
		.set({
			status: 'cancelled',
			cancelledAt: new Date(),
			cancelledBy: clerkUserId,
			cancelledByNameSnapshot: await resolveStaffName(clerkUserId),
		})
		.where(and(eq(tasks.id, taskId), eq(tasks.status, 'open')))
		.returning();
	if (!updated) throw new TaskConflictError('This task is already closed');

	return toTaskDto(updated, await residentNameFor(updated.residentId), viewer, today);
}
