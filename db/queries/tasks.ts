// db/queries/tasks.ts
//
// Read side of the tasks hub. Every entry point takes the caller's Clerk id.
// Scoping happens twice on purpose: SQL narrows to the caller's locations so
// we never load another home's rows, then `canSeeTask` (lib/tasks.ts) applies
// the per-task visibility rule. Neither check alone is enough.

import {and, asc, desc, eq, inArray, lte, ne, sql} from 'drizzle-orm';
import {db} from '../index';
import {employees, locations, residents, tasks} from '../schema';
import {AccessDeniedError, logAudit, requireCareAccess} from '@/lib/db-helpers';
import {computeOperationalDate} from '@/lib/operational-time';
import {isInactiveResident} from '@/lib/resident-status';
import {
	canCompleteTask,
	canEditOrCancelTask,
	canSeeTask,
	classifyTask,
	isTaskKind,
	showsOnOverdueBanner,
	taskKindLabel,
	type TaskFacts,
	type TaskStatus,
	type TaskTiming,
	type TaskViewer,
	type TaskVisibility,
} from '@/lib/tasks';
import {getOperationalTimeZone} from './care';

export type TaskDto = {
	id: string;
	kind: string;
	kindLabel: string;
	title: string;
	description: string | null;
	location: string;
	residentId: string | null;
	residentName: string | null;
	assignedStaffId: string | null;
	assignedName: string | null;
	visibility: TaskVisibility;
	dueDate: string;
	dueTime: string | null;
	status: TaskStatus;
	/** Only meaningful while the task is open. */
	timing: TaskTiming;
	daysOverdue: number;
	createdBy: string;
	createdByName: string;
	createdAt: string;
	completedAt: string | null;
	completedByName: string | null;
	completionNote: string | null;
	cancelledAt: string | null;
	cancelledByName: string | null;
	/** What the caller may do, so the UI does not re-derive the rules. */
	canComplete: boolean;
	canEditOrCancel: boolean;
};

type TaskRow = typeof tasks.$inferSelect;

/** The caller as the pure rules in lib/tasks.ts see them. */
export async function loadTaskViewer(clerkUserId: string): Promise<TaskViewer> {
	const userRole = await requireCareAccess(clerkUserId);
	return {
		clerkUserId,
		role: (userRole.role ?? '').toLowerCase(),
		locations: userRole.locations ?? [],
	};
}

export function taskFacts(row: TaskRow): TaskFacts {
	return {
		location: row.location,
		visibility: row.visibility as TaskVisibility,
		assignedStaffId: row.assignedStaffId,
		createdBy: row.createdBy,
		status: row.status as TaskStatus,
		dueDate: row.dueDate,
	};
}

export function toTaskDto(
	row: TaskRow,
	residentName: string | null,
	viewer: TaskViewer,
	today: string
): TaskDto {
	const facts = taskFacts(row);
	const {timing, daysOverdue} = classifyTask(facts, today);
	return {
		id: row.id,
		kind: row.kind,
		kindLabel: taskKindLabel(row.kind),
		title: row.title,
		description: row.description,
		location: row.location,
		residentId: row.residentId,
		residentName,
		assignedStaffId: row.assignedStaffId,
		assignedName: row.assignedNameSnapshot,
		visibility: facts.visibility,
		dueDate: row.dueDate,
		dueTime: row.dueTime,
		status: facts.status,
		timing,
		daysOverdue,
		createdBy: row.createdBy,
		createdByName: row.createdByNameSnapshot,
		createdAt: row.createdAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
		completedByName: row.completedByNameSnapshot,
		completionNote: row.completionNote,
		cancelledAt: row.cancelledAt?.toISOString() ?? null,
		cancelledByName: row.cancelledByNameSnapshot,
		canComplete: canCompleteTask(viewer, facts),
		canEditOrCancel: canEditOrCancelTask(viewer, facts, today),
	};
}

export async function operationalToday(): Promise<string> {
	return computeOperationalDate(new Date(), await getOperationalTimeZone());
}

/**
 * SQL location gate. Admins see every home. Everyone else is limited to their
 * assigned homes, and asking for a home outside that set is denied (and
 * audited) rather than silently returning an empty list.
 * Returns `null` when the caller has no homes at all.
 */
async function locationCondition(viewer: TaskViewer, requested?: string) {
	if (viewer.role === 'admin') {
		return requested ? eq(tasks.location, requested) : undefined;
	}
	if (requested) {
		if (!viewer.locations.includes(requested)) {
			await logAudit({
				clerkUserId: viewer.clerkUserId,
				event: 'access_denied',
				details: 'tasks_cross_location',
				deviceId: 'system',
				location: requested,
			});
			throw new AccessDeniedError('Access denied');
		}
		return eq(tasks.location, requested);
	}
	if (viewer.locations.length === 0) return null;
	return inArray(tasks.location, [...viewer.locations]);
}

export type TaskListFilters = {
	/** Location NAME, as stored on residents and care logs. */
	location?: string;
	/** 'open' (default) or 'history' (done + cancelled). */
	view?: 'open' | 'history';
	kind?: string;
	residentId?: string;
};

const HISTORY_LIMIT = 200;

/**
 * The task list. Open tasks come back oldest due date first, so overdue work
 * leads; history comes back most recently closed first, capped at 200.
 */
export async function getTasksForScope(
	clerkUserId: string,
	filters: TaskListFilters = {}
): Promise<{today: string; tasks: TaskDto[]}> {
	const viewer = await loadTaskViewer(clerkUserId);
	const today = await operationalToday();

	const scope = await locationCondition(viewer, filters.location);
	if (scope === null) return {today, tasks: []};

	const history = filters.view === 'history';
	const rows = await db
		.select({task: tasks, residentName: residents.name})
		.from(tasks)
		.leftJoin(residents, eq(tasks.residentId, residents.id))
		.where(
			and(
				scope,
				history ? ne(tasks.status, 'open') : eq(tasks.status, 'open'),
				filters.kind && isTaskKind(filters.kind)
					? eq(tasks.kind, filters.kind)
					: undefined,
				filters.residentId ? eq(tasks.residentId, filters.residentId) : undefined
			)
		)
		.orderBy(
			...(history
				? [desc(sql`coalesce(${tasks.completedAt}, ${tasks.cancelledAt})`)]
				: [asc(tasks.dueDate), asc(tasks.dueTime), asc(tasks.createdAt)])
		)
		.limit(history ? HISTORY_LIMIT : 1000);

	return {
		today,
		tasks: rows
			.filter(({task}) => canSeeTask(viewer, taskFacts(task)))
			.map(({task, residentName}) => toTaskDto(task, residentName, viewer, today)),
	};
}

export type TaskAlerts = {
	/** For the non-dismissible banner on the care home page. Oldest first. */
	overdueTasks: TaskDto[];
	/** For the ordinary dashboard feed. */
	tasksDueToday: TaskDto[];
};

/**
 * Open tasks that are due today or overdue and belong in front of this user.
 * Computed on read, so a task turns overdue the moment the operational day
 * rolls over, with no cron involved. Tasks about a resident who has since
 * become inactive stop alerting (the task itself is kept).
 */
export async function getTaskAlertsForUser(clerkUserId: string): Promise<TaskAlerts> {
	const viewer = await loadTaskViewer(clerkUserId);
	const scope = await locationCondition(viewer);
	if (scope === null) return {overdueTasks: [], tasksDueToday: []};

	const today = await operationalToday();
	const rows = await db
		.select({
			task: tasks,
			residentName: residents.name,
			residentStatus: residents.status,
		})
		.from(tasks)
		.leftJoin(residents, eq(tasks.residentId, residents.id))
		.where(and(scope, eq(tasks.status, 'open'), lte(tasks.dueDate, today)))
		.orderBy(asc(tasks.dueDate), asc(tasks.dueTime), asc(tasks.createdAt));

	const alerts: TaskAlerts = {overdueTasks: [], tasksDueToday: []};
	for (const {task, residentName, residentStatus} of rows) {
		if (task.residentId && isInactiveResident({status: residentStatus})) continue;
		const facts = taskFacts(task);
		if (showsOnOverdueBanner(viewer, facts, today)) {
			alerts.overdueTasks.push(toTaskDto(task, residentName, viewer, today));
		} else if (task.dueDate === today && canCompleteTask(viewer, facts)) {
			// Due-today reminders go to people who can act on the task, not to
			// colleagues who can merely see one tagged to someone else.
			alerts.tasksDueToday.push(toTaskDto(task, residentName, viewer, today));
		}
	}
	return alerts;
}

export type TaskAssigneeOption = {
	clerkUserId: string;
	name: string;
	role: string | null;
};

/**
 * People who can be tagged on a task at one home: employees assigned to that
 * location who have a login and are not marked inactive. The caller must be
 * able to create tasks there.
 */
export async function getTaskAssigneeOptions(
	clerkUserId: string,
	location: string
): Promise<TaskAssigneeOption[]> {
	const viewer = await loadTaskViewer(clerkUserId);
	await locationCondition(viewer, location); // throws when out of scope

	const rows = await db
		.select({
			clerkUserId: employees.clerkUserId,
			name: employees.name,
			role: employees.role,
			employmentStatus: employees.employmentStatus,
		})
		.from(employees)
		.where(sql`${employees.locations} @> ${JSON.stringify([location])}::jsonb`)
		.orderBy(asc(employees.name));

	return rows
		.filter(
			(row): row is typeof row & {clerkUserId: string} =>
				!!row.clerkUserId &&
				(row.employmentStatus ?? '').toLowerCase() !== 'inactive'
		)
		.map((row) => ({
			clerkUserId: row.clerkUserId,
			name: row.name,
			role: row.role?.toLowerCase() ?? null,
		}));
}

export type TaskFormMeta = {
	role: string;
	/** Homes the caller can create tasks for (every home, for admins). */
	locations: string[];
};

/** What the task screens need before a home is chosen. */
export async function getTaskFormMeta(clerkUserId: string): Promise<TaskFormMeta> {
	const viewer = await loadTaskViewer(clerkUserId);
	if (viewer.role !== 'admin') {
		return {role: viewer.role, locations: [...viewer.locations].sort()};
	}
	const homes = await db
		.select({name: locations.name})
		.from(locations)
		.orderBy(asc(locations.name));
	return {role: viewer.role, locations: homes.map((home) => home.name)};
}

export type TaskHomeOptions = {
	assignees: TaskAssigneeOption[];
	residents: Array<{id: string; name: string}>;
};

/** Pickers for one home: who can be tagged, and its active residents. */
export async function getTaskHomeOptions(
	clerkUserId: string,
	location: string
): Promise<TaskHomeOptions> {
	// Scope is checked (and a cross-home request audited) by the first call.
	const assignees = await getTaskAssigneeOptions(clerkUserId, location);
	const rows = await db
		.select({id: residents.id, name: residents.name, status: residents.status})
		.from(residents)
		.where(eq(residents.location, location))
		.orderBy(asc(residents.name));
	return {
		assignees,
		residents: rows
			.filter((row) => !isInactiveResident(row))
			.map(({id, name}) => ({id, name})),
	};
}
