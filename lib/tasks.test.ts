import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	TASK_KINDS,
	TaskValidationError,
	canCompleteTask,
	canEditOrCancelTask,
	canSeeTask,
	classifyTask,
	daysBetween,
	isIsoDate,
	showsOnOverdueBanner,
	taskKindLabel,
	validateTaskInput,
	type TaskFacts,
	type TaskViewer,
} from './tasks';

const TODAY = '2026-11-10';
const HOME = 'Maple House';
const OTHER_HOME = 'Oak House';

const admin: TaskViewer = {clerkUserId: 'admin-1', role: 'admin', locations: []};
const supervisor: TaskViewer = {clerkUserId: 'sup-1', role: 'supervisor', locations: [HOME]};
const otherSupervisor: TaskViewer = {
	clerkUserId: 'sup-2',
	role: 'supervisor',
	locations: [OTHER_HOME],
};
const creator: TaskViewer = {clerkUserId: 'staff-creator', role: 'staff', locations: [HOME]};
const named: TaskViewer = {clerkUserId: 'staff-named', role: 'staff', locations: [HOME]};
const colleague: TaskViewer = {clerkUserId: 'staff-colleague', role: 'staff', locations: [HOME]};
const outsider: TaskViewer = {clerkUserId: 'staff-out', role: 'staff', locations: [OTHER_HOME]};

const task = (overrides: Partial<TaskFacts> = {}): TaskFacts => ({
	location: HOME,
	visibility: 'home',
	assignedStaffId: null,
	createdBy: creator.clerkUserId,
	status: 'open',
	dueDate: TODAY,
	...overrides,
});

// --- kinds ------------------------------------------------------------------

test('Other is always the last kind', () => {
	assert.equal(TASK_KINDS[TASK_KINDS.length - 1].key, 'other');
});

test('an unknown stored kind still gets a label', () => {
	assert.equal(taskKindLabel('medication_refill'), 'Medication refill');
	assert.equal(taskKindLabel('a_kind_removed_later'), 'Other');
});

// --- timing -----------------------------------------------------------------

test('daysBetween counts whole days across month ends', () => {
	assert.equal(daysBetween('2026-10-30', '2026-11-02'), 3);
	assert.equal(daysBetween('2026-11-10', '2026-11-09'), -1);
});

test('a task is due for its whole due date and overdue from the next day', () => {
	assert.deepEqual(classifyTask({dueDate: '2026-11-12'}, TODAY), {
		timing: 'upcoming',
		daysOverdue: 0,
	});
	assert.deepEqual(classifyTask({dueDate: TODAY}, TODAY), {
		timing: 'due_today',
		daysOverdue: 0,
	});
	assert.deepEqual(classifyTask({dueDate: '2026-11-07'}, TODAY), {
		timing: 'overdue',
		daysOverdue: 3,
	});
});

// --- visibility -------------------------------------------------------------

test('home task: everyone at the home sees it, nobody elsewhere', () => {
	const t = task();
	for (const viewer of [admin, supervisor, creator, named, colleague]) {
		assert.equal(canSeeTask(viewer, t), true, viewer.clerkUserId);
	}
	assert.equal(canSeeTask(outsider, t), false);
	assert.equal(canSeeTask(otherSupervisor, t), false);
});

test('named-person-only task: the person, the creator, supervisors and admins', () => {
	const t = task({visibility: 'assignee', assignedStaffId: named.clerkUserId});
	assert.equal(canSeeTask(named, t), true);
	assert.equal(canSeeTask(creator, t), true);
	assert.equal(canSeeTask(supervisor, t), true);
	assert.equal(canSeeTask(admin, t), true);
	assert.equal(canSeeTask(colleague, t), false);
	assert.equal(canSeeTask(otherSupervisor, t), false);
});

test('supervisors-only task is hidden from all staff, even its named person', () => {
	const t = task({
		visibility: 'supervisors',
		createdBy: supervisor.clerkUserId,
		assignedStaffId: named.clerkUserId,
	});
	assert.equal(canSeeTask(supervisor, t), true);
	assert.equal(canSeeTask(admin, t), true);
	assert.equal(canSeeTask(named, t), false);
	assert.equal(canSeeTask(colleague, t), false);
	assert.equal(canSeeTask(otherSupervisor, t), false);
});

// --- completing -------------------------------------------------------------

test('home task: whoever is on shift at the home can complete it', () => {
	const t = task();
	assert.equal(canCompleteTask(colleague, t), true);
	assert.equal(canCompleteTask(supervisor, t), true);
	assert.equal(canCompleteTask(outsider, t), false);
});

test('tagged task: only the named person, or a supervisor/admin on their behalf', () => {
	const t = task({assignedStaffId: named.clerkUserId}); // visible to the whole home
	assert.equal(canSeeTask(colleague, t), true);
	assert.equal(canCompleteTask(colleague, t), false);
	assert.equal(canCompleteTask(creator, t), false);
	assert.equal(canCompleteTask(named, t), true);
	assert.equal(canCompleteTask(supervisor, t), true);
	assert.equal(canCompleteTask(admin, t), true);
});

test('a done or cancelled task cannot be completed again', () => {
	assert.equal(canCompleteTask(admin, task({status: 'done'})), false);
	assert.equal(canCompleteTask(admin, task({status: 'cancelled'})), false);
});

// --- editing / cancelling ---------------------------------------------------

test('staff can edit or cancel only their own task, and only before it is overdue', () => {
	assert.equal(canEditOrCancelTask(creator, task(), TODAY), true);
	assert.equal(canEditOrCancelTask(colleague, task(), TODAY), false);
	assert.equal(canEditOrCancelTask(creator, task({dueDate: '2026-11-09'}), TODAY), false);
});

test('supervisors and admins can cancel an overdue task in their scope', () => {
	const overdue = task({dueDate: '2026-11-01'});
	assert.equal(canEditOrCancelTask(supervisor, overdue, TODAY), true);
	assert.equal(canEditOrCancelTask(admin, overdue, TODAY), true);
	assert.equal(canEditOrCancelTask(otherSupervisor, overdue, TODAY), false);
});

// --- overdue banner ---------------------------------------------------------

test('nothing shows on the banner until the day after the due date', () => {
	assert.equal(showsOnOverdueBanner(colleague, task(), TODAY), false);
	assert.equal(showsOnOverdueBanner(colleague, task({dueDate: '2026-11-09'}), TODAY), true);
});

test('overdue home task shows for every staff member at the home', () => {
	const t = task({dueDate: '2026-11-08'});
	for (const viewer of [creator, named, colleague, supervisor, admin]) {
		assert.equal(showsOnOverdueBanner(viewer, t, TODAY), true, viewer.clerkUserId);
	}
	assert.equal(showsOnOverdueBanner(outsider, t, TODAY), false);
});

test('overdue tagged task shows for the named person, not their colleagues', () => {
	const t = task({dueDate: '2026-11-08', assignedStaffId: named.clerkUserId});
	assert.equal(showsOnOverdueBanner(named, t, TODAY), true);
	assert.equal(showsOnOverdueBanner(colleague, t, TODAY), false);
	assert.equal(showsOnOverdueBanner(creator, t, TODAY), false);
	assert.equal(showsOnOverdueBanner(supervisor, t, TODAY), true);
});

test('overdue supervisors-only task shows for supervisors, never staff', () => {
	const t = task({
		dueDate: '2026-11-08',
		visibility: 'supervisors',
		createdBy: supervisor.clerkUserId,
	});
	assert.equal(showsOnOverdueBanner(supervisor, t, TODAY), true);
	assert.equal(showsOnOverdueBanner(colleague, t, TODAY), false);
});

test('done and cancelled tasks never show on the banner', () => {
	assert.equal(
		showsOnOverdueBanner(admin, task({dueDate: '2026-11-01', status: 'done'}), TODAY),
		false
	);
	assert.equal(
		showsOnOverdueBanner(admin, task({dueDate: '2026-11-01', status: 'cancelled'}), TODAY),
		false
	);
});

// --- validation -------------------------------------------------------------

const input = (overrides: Record<string, unknown> = {}) => ({
	kind: 'appointment',
	title: '  Book dental check-up  ',
	location: HOME,
	dueDate: '2026-11-20',
	...overrides,
});

test('a minimal task is accepted and normalized', () => {
	assert.deepEqual(validateTaskInput(input(), {creatorRole: 'staff'}), {
		kind: 'appointment',
		title: 'Book dental check-up',
		description: null,
		location: HOME,
		residentId: null,
		assignedStaffId: null,
		visibility: 'home',
		dueDate: '2026-11-20',
		dueTime: null,
	});
});

test('isIsoDate rejects impossible dates', () => {
	assert.equal(isIsoDate('2026-02-28'), true);
	assert.equal(isIsoDate('2026-02-30'), false);
	assert.equal(isIsoDate('11/20/2026'), false);
});

test('bad kind, title, date and time are rejected', () => {
	const bad = (overrides: Record<string, unknown>) =>
		assert.throws(
			() => validateTaskInput(input(overrides), {creatorRole: 'staff'}),
			TaskValidationError
		);
	bad({kind: 'made_up'});
	bad({title: '   '});
	bad({title: 'x'.repeat(201)});
	bad({dueDate: '2026-02-30'});
	bad({dueTime: '25:00'});
	bad({location: ''});
});

test('a new task cannot be created already overdue', () => {
	assert.throws(
		() =>
			validateTaskInput(input({dueDate: '2026-11-09'}), {
				creatorRole: 'staff',
				today: TODAY,
				requireNotPast: true,
			}),
		TaskValidationError
	);
	// Due today is fine.
	validateTaskInput(input({dueDate: TODAY}), {
		creatorRole: 'staff',
		today: TODAY,
		requireNotPast: true,
	});
});

test('"only the named person" needs a named person', () => {
	assert.throws(
		() => validateTaskInput(input({visibility: 'assignee'}), {creatorRole: 'staff'}),
		TaskValidationError
	);
	const ok = validateTaskInput(
		input({visibility: 'assignee', assignedStaffId: 'staff-named'}),
		{creatorRole: 'staff'}
	);
	assert.equal(ok.visibility, 'assignee');
});

test('staff cannot create supervisors-only tasks; supervisors can', () => {
	assert.throws(
		() => validateTaskInput(input({visibility: 'supervisors'}), {creatorRole: 'staff'}),
		TaskValidationError
	);
	assert.equal(
		validateTaskInput(input({visibility: 'supervisors'}), {creatorRole: 'supervisor'})
			.visibility,
		'supervisors'
	);
});
