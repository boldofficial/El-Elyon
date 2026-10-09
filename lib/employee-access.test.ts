import assert from 'node:assert/strict';
import test from 'node:test';
import {checkEmployeeCreate, checkEmployeeUpdate, type EmployeeActor} from './employee-access';

const admin: EmployeeActor = {clerkUserId: 'admin-1', isAdmin: true};
// A supervisor delegated "Manage Employees" (manage_employees).
const manager: EmployeeActor = {clerkUserId: 'sup-1', isAdmin: false};

const staffRecord = {clerkUserId: 'staff-1', role: 'staff', locations: ['Maple House']};
const adminRecord = {clerkUserId: 'admin-2', role: 'admin', locations: []};
const managerOwnRecord = {clerkUserId: 'sup-1', role: 'supervisor', locations: ['Maple House']};

test('admins may create any role, including admin', () => {
	for (const role of ['admin', 'supervisor', 'staff'] as const) {
		assert.deepEqual(checkEmployeeCreate(admin, {role}), {ok: true}, role);
	}
});

test('a manage_employees supervisor may create staff and supervisors but not admins', () => {
	assert.deepEqual(checkEmployeeCreate(manager, {role: 'staff'}), {ok: true});
	assert.deepEqual(checkEmployeeCreate(manager, {role: 'supervisor'}), {ok: true});
	assert.equal(checkEmployeeCreate(manager, {role: 'admin'}).ok, false);
});

test('admins may edit anyone, including other admins and themselves', () => {
	assert.ok(checkEmployeeUpdate(admin, adminRecord, {role: 'staff', locations: ['Oak']}).ok);
	assert.ok(checkEmployeeUpdate(admin, staffRecord, {role: 'admin', locations: []}).ok);
	assert.ok(
		checkEmployeeUpdate(admin, {...adminRecord, clerkUserId: 'admin-1'}, {role: 'admin', locations: ['Oak']}).ok
	);
});

test('a manage_employees supervisor may edit staff role and locations', () => {
	const decision = checkEmployeeUpdate(manager, staffRecord, {
		role: 'supervisor',
		locations: ['Maple House', 'Oak'],
	});
	assert.deepEqual(decision, {ok: true});
});

test('a manage_employees supervisor cannot grant the admin role', () => {
	const decision = checkEmployeeUpdate(manager, staffRecord, {role: 'admin', locations: ['Maple House']});
	assert.equal(decision.ok, false);
});

test("a manage_employees supervisor cannot edit an admin's record, even with role unchanged", () => {
	for (const next of [
		{role: 'admin' as const, locations: []},
		{role: 'staff' as const, locations: []},
	]) {
		assert.equal(checkEmployeeUpdate(manager, adminRecord, next).ok, false, next.role);
	}
	// Stored roles aren't guaranteed lower-case.
	assert.equal(
		checkEmployeeUpdate(manager, {...adminRecord, role: 'Admin'}, {role: 'staff', locations: []}).ok,
		false
	);
});

test('a non-admin cannot change their own role or locations', () => {
	assert.equal(
		checkEmployeeUpdate(manager, managerOwnRecord, {role: 'staff', locations: ['Maple House']}).ok,
		false
	);
	assert.equal(
		checkEmployeeUpdate(manager, managerOwnRecord, {role: 'supervisor', locations: ['Maple House', 'Oak']}).ok,
		false
	);
});

test('a non-admin may save their own record when role and locations are unchanged', () => {
	const decision = checkEmployeeUpdate(manager, managerOwnRecord, {
		role: 'supervisor',
		locations: ['Maple House'],
	});
	assert.deepEqual(decision, {ok: true});
});

test('location order and duplicates do not count as a change', () => {
	const record = {...managerOwnRecord, locations: ['Maple House', 'Oak']};
	assert.ok(
		checkEmployeeUpdate(manager, record, {role: 'supervisor', locations: ['Oak', 'Maple House', 'Oak']}).ok
	);
});

test('a record with no linked Clerk user is never treated as the caller', () => {
	const unlinked = {clerkUserId: null, role: 'staff', locations: []};
	assert.ok(checkEmployeeUpdate(manager, unlinked, {role: 'supervisor', locations: ['Oak']}).ok);
});
