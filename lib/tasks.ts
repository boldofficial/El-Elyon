// lib/tasks.ts
//
// Pure rules for the tasks hub: what kinds exist, when a task is overdue, who
// can see, complete, edit or cancel it, and whose home page gets the overdue
// banner. Everything here is a pure function of its inputs so it can be
// unit-tested without a database, mirroring `custom-log-schedule.ts`.
//
// The hub is for one-off work outside a home's daily rhythm (book an
// appointment, chase a refill, renew a document). There are no repeating
// tasks.

/**
 * The kinds a task can be filed under. A kind is only a label: nothing in the
 * app behaves differently per kind. To add one, add a line here; the database
 * column has no constraint, so no migration is needed. `other` stays last so
 * nobody is ever unable to record a task because no kind fits.
 */
export const TASK_KINDS = [
	{key: 'appointment', label: 'Appointment / booking'},
	{key: 'medication_refill', label: 'Medication refill'},
	{key: 'house_chore', label: 'House chore'},
	{key: 'document_renewal', label: 'Document renewal'},
	{key: 'other', label: 'Other'},
] as const;

export type TaskKind = (typeof TASK_KINDS)[number]['key'];

export function isTaskKind(value: unknown): value is TaskKind {
	return TASK_KINDS.some((kind) => kind.key === value);
}

/** Label for a stored kind; a kind removed from the list still reads sensibly. */
export function taskKindLabel(kind: string): string {
	return TASK_KINDS.find((k) => k.key === kind)?.label ?? 'Other';
}

/**
 * home        – everyone who works at the home
 * assignee    – only the named person (plus creator, supervisors, admins)
 * supervisors – supervisors of the home and admins only
 */
export type TaskVisibility = 'home' | 'assignee' | 'supervisors';
export type TaskStatus = 'open' | 'done' | 'cancelled';

export const TASK_TITLE_MAX = 200;
export const TASK_TEXT_MAX = 2000;

/** The fields of a task the rules below depend on. */
export interface TaskFacts {
	location: string;
	visibility: TaskVisibility;
	assignedStaffId: string | null;
	createdBy: string;
	status: TaskStatus;
	/** Operational date, "YYYY-MM-DD". */
	dueDate: string;
}

/** The person looking at or acting on a task. */
export interface TaskViewer {
	clerkUserId: string;
	/** Lower-cased role: 'admin' | 'supervisor' | 'staff'. */
	role: string;
	locations: readonly string[];
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const CLOCK_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

const isAdmin = (viewer: TaskViewer) => viewer.role === 'admin';

/** Admin anywhere, or a supervisor of the task's home. Sees and manages every task there. */
function isOverseer(viewer: TaskViewer, task: Pick<TaskFacts, 'location'>) {
	if (isAdmin(viewer)) return true;
	return viewer.role === 'supervisor' && viewer.locations.includes(task.location);
}

function worksAtHome(viewer: TaskViewer, task: Pick<TaskFacts, 'location'>) {
	return viewer.locations.includes(task.location);
}

// ---------------------------------------------------------------------------
// Due / overdue
// ---------------------------------------------------------------------------

export type TaskTiming = 'upcoming' | 'due_today' | 'overdue';

/** Whole days from `from` to `to` (both "YYYY-MM-DD"); negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
	const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
	return Math.round(ms / 86_400_000);
}

/**
 * Where an open task stands against today's operational date. A task is due
 * for the whole of its due date and overdue from the next operational day, so
 * the night shift after midnight still sees "due today", not "overdue".
 */
export function classifyTask(
	task: Pick<TaskFacts, 'dueDate'>,
	today: string
): {timing: TaskTiming; daysOverdue: number} {
	const late = daysBetween(task.dueDate, today);
	if (late > 0) return {timing: 'overdue', daysOverdue: late};
	if (late === 0) return {timing: 'due_today', daysOverdue: 0};
	return {timing: 'upcoming', daysOverdue: 0};
}

export function isOverdue(task: Pick<TaskFacts, 'dueDate' | 'status'>, today: string) {
	return task.status === 'open' && classifyTask(task, today).timing === 'overdue';
}

// ---------------------------------------------------------------------------
// Who can do what
// ---------------------------------------------------------------------------

/** Server-side visibility rule; every task read must pass through this. */
export function canSeeTask(viewer: TaskViewer, task: TaskFacts): boolean {
	if (isOverseer(viewer, task)) return true;
	// Everyone below is staff, or a supervisor outside their own homes.
	if (!worksAtHome(viewer, task)) return false;
	switch (task.visibility) {
		case 'home':
			return true;
		case 'assignee':
			return (
				task.assignedStaffId === viewer.clerkUserId ||
				task.createdBy === viewer.clerkUserId
			);
		case 'supervisors':
			return false;
	}
}

/**
 * A home task can be completed by anyone who can see it. A task tagged to a
 * named person can be completed by that person, or by a supervisor/admin on
 * their behalf, but not by a colleague who merely sees it.
 */
export function canCompleteTask(viewer: TaskViewer, task: TaskFacts): boolean {
	if (task.status !== 'open') return false;
	if (!canSeeTask(viewer, task)) return false;
	if (isOverseer(viewer, task)) return true;
	if (task.assignedStaffId) return task.assignedStaffId === viewer.clerkUserId;
	return true;
}

/**
 * Supervisors and admins can edit or cancel any open task in their scope.
 * Staff can edit or cancel only a task they created, and only while it is not
 * overdue: once the overdue banner is up, it cannot be cleared by quietly
 * cancelling the task or pushing its date back.
 */
export function canEditOrCancelTask(
	viewer: TaskViewer,
	task: TaskFacts,
	today: string
): boolean {
	if (task.status !== 'open') return false;
	if (isOverseer(viewer, task)) return true;
	if (!canSeeTask(viewer, task)) return false;
	return task.createdBy === viewer.clerkUserId && !isOverdue(task, today);
}

/**
 * Whether an overdue task belongs on this viewer's home-page banner.
 *  - named-person task  -> that person
 *  - home task          -> every staff member at the home
 *  - supervisors-only   -> supervisors of the home
 * Supervisors and admins additionally see every overdue task in their scope.
 */
export function showsOnOverdueBanner(
	viewer: TaskViewer,
	task: TaskFacts,
	today: string
): boolean {
	if (!isOverdue(task, today)) return false;
	if (isOverseer(viewer, task)) return true;
	if (!canSeeTask(viewer, task)) return false;
	if (task.assignedStaffId) return task.assignedStaffId === viewer.clerkUserId;
	return true;
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

export class TaskValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TaskValidationError';
	}
}

export interface TaskInput {
	kind: TaskKind;
	title: string;
	description: string | null;
	location: string;
	residentId: string | null;
	assignedStaffId: string | null;
	visibility: TaskVisibility;
	dueDate: string;
	dueTime: string | null;
}

function optionalText(value: unknown, field: string): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') throw new TaskValidationError(`${field} must be text`);
	const trimmed = value.trim();
	if (!trimmed) return null;
	if (trimmed.length > TASK_TEXT_MAX) {
		throw new TaskValidationError(`${field} must be ${TASK_TEXT_MAX} characters or fewer`);
	}
	return trimmed;
}

function optionalId(value: unknown, field: string): string | null {
	if (value === undefined || value === null || value === '') return null;
	if (typeof value !== 'string') throw new TaskValidationError(`${field} is invalid`);
	return value;
}

/** True for a real calendar date in "YYYY-MM-DD" form (rejects 2026-02-30). */
export function isIsoDate(value: unknown): value is string {
	if (typeof value !== 'string' || !ISO_DATE_RE.test(value)) return false;
	const parsed = new Date(`${value}T00:00:00Z`);
	return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Normalizes and checks the shape of a new or edited task. Scope checks that
 * need the database (is the creator at this location, does the named person
 * work there, is the resident there) belong to the mutation layer.
 *
 * `today` is only used when `requireNotPast` is set (creation): a brand-new
 * task that is already overdue would raise a banner the moment it is saved.
 */
export function validateTaskInput(
	raw: Record<string, unknown>,
	options: {creatorRole: string; today?: string; requireNotPast?: boolean}
): TaskInput {
	if (!isTaskKind(raw.kind)) throw new TaskValidationError('Choose a kind of task');

	if (typeof raw.title !== 'string' || !raw.title.trim()) {
		throw new TaskValidationError('A title is required');
	}
	const title = raw.title.trim();
	if (title.length > TASK_TITLE_MAX) {
		throw new TaskValidationError(`Title must be ${TASK_TITLE_MAX} characters or fewer`);
	}

	if (typeof raw.location !== 'string' || !raw.location.trim()) {
		throw new TaskValidationError('A home is required');
	}

	if (!isIsoDate(raw.dueDate)) throw new TaskValidationError('A valid due date is required');
	if (options.requireNotPast && options.today && raw.dueDate < options.today) {
		throw new TaskValidationError('The due date cannot be in the past');
	}

	let dueTime: string | null = null;
	if (raw.dueTime !== undefined && raw.dueTime !== null && raw.dueTime !== '') {
		if (typeof raw.dueTime !== 'string' || !CLOCK_TIME_RE.test(raw.dueTime)) {
			throw new TaskValidationError('Time must be in HH:MM form');
		}
		dueTime = raw.dueTime;
	}

	const assignedStaffId = optionalId(raw.assignedStaffId, 'Named person');

	const visibility = (raw.visibility ?? 'home') as TaskVisibility;
	if (!['home', 'assignee', 'supervisors'].includes(visibility)) {
		throw new TaskValidationError('Choose who can see this task');
	}
	if (visibility === 'assignee' && !assignedStaffId) {
		throw new TaskValidationError(
			'Choose the named person before limiting the task to them'
		);
	}
	if (visibility === 'supervisors' && options.creatorRole === 'staff') {
		throw new TaskValidationError('Only supervisors and admins can create supervisor-only tasks');
	}

	return {
		kind: raw.kind,
		title,
		description: optionalText(raw.description, 'Description'),
		location: raw.location.trim(),
		residentId: optionalId(raw.residentId, 'Resident'),
		assignedStaffId,
		visibility,
		dueDate: raw.dueDate,
		dueTime,
	};
}
