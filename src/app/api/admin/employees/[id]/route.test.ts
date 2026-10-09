/**
 * DB-free tests for who may edit or create employee records.
 *
 * updateEmployee used to skip its permission check for a "self-update": the
 * caller's own record, or any record whose email matched the submitted email.
 * The PUT route only checks sign-in, so any staff member could make themselves
 * an admin, or rewrite anyone's role by echoing their email. createEmployee had
 * the same hole for the caller's own email. These drive the real handlers with
 * db/index, Clerk and email stubbed; lib/employee-access.test.ts covers the
 * rule itself case by case.
 *
 * Run with --experimental-test-module-mocks (see the test:employee-access script).
 */
import assert from 'node:assert/strict';
import test, {before, beforeEach, mock} from 'node:test';
import {pathToFileURL} from 'node:url';

const CALLER = 'clerk-user-under-test';
const CALLER_EMAIL = 'caller@example.test';
const EMPLOYEE = '6a000000-0000-4000-8000-000000000001';

type Row = Record<string, unknown>;

let callerRole: {role: string; locations: string[]} | undefined;
let callerHasManageEmployees: boolean;
let targetEmployee: Row | undefined;
let auditRows: Row[];
let updates: {table: unknown; values: Row}[];
let metadataUpdates: {userId: string; metadata: Row}[];

let schema: typeof import('../../../../../../db/schema');
let PUT: (typeof import('./route'))['PUT'];
let POST: (typeof import('../route'))['POST'];
let NextRequest: (typeof import('next/server'))['NextRequest'];

before(async () => {
	schema = await import('../../../../../../db/schema');

	mock.module('../../../../../../db/index', {
		namedExports: {
			db: {
				query: {
					// Serves both the record being edited and getUserRoleDoc's
					// lookup of the caller's own employee row.
					employees: {findFirst: async () => targetEmployee},
					roles: {
						findFirst: async () => callerRole,
						// checkForAdmins: an admin exists, so no first-admin bypass.
						findMany: async () => [{clerkUserId: 'some-admin', role: 'admin'}],
					},
					// requireAdminOrPrivilege only ever asks about manage_employees here.
					adminPrivileges: {
						findFirst: async () =>
							callerHasManageEmployees ? {privilege: 'manage_employees'} : undefined,
					},
				},
				insert: (table: unknown) => ({
					values: async (row: Row) => {
						assert.equal(table, schema.auditLogs, 'unexpected insert');
						auditRows.push(row);
					},
				}),
				update: (table: unknown) => ({
					set: (values: Row) => ({
						where: async () => {
							updates.push({table, values});
						},
					}),
				}),
				batch: async () => assert.fail('no employee should be created'),
			},
		},
	});

	mock.module('../../../../../../lib/emails/employee', {
		namedExports: {
			sendEmployeeInviteEmail: async () => assert.fail('no email expected'),
			sendWelcomeEmailWithCredentials: async () => assert.fail('no email expected'),
		},
	});

	// tsx loads the route as CommonJS, so mock the CJS build of Clerk that it
	// actually requires (see resident-documents/route.test.ts).
	mock.module(pathToFileURL(require.resolve('@clerk/nextjs/server')).href, {
		namedExports: {
			auth: async () => ({userId: CALLER}),
			clerkClient: async () => ({
				users: {
					getUser: async (id: string) => ({
						id,
						emailAddresses: [{emailAddress: CALLER_EMAIL}],
						firstName: 'Test',
						lastName: 'Caller',
						publicMetadata: {},
					}),
					getUserList: async () => assert.fail('no Clerk user lookup expected'),
					createUser: async () => assert.fail('no Clerk user should be created'),
					updateUserMetadata: async (userId: string, metadata: Row) => {
						metadataUpdates.push({userId, metadata});
					},
				},
			}),
		},
	});

	({PUT} = await import('./route'));
	({POST} = await import('../route'));
	({NextRequest} = await import('next/server'));
});

beforeEach(() => {
	callerRole = {role: 'staff', locations: ['Maple House']};
	callerHasManageEmployees = false;
	targetEmployee = {
		id: EMPLOYEE,
		clerkUserId: 'someone-else',
		name: 'Pat Doe',
		email: 'pat@example.test',
		workEmail: 'pat@example.test',
		role: 'staff',
		locations: ['Maple House'],
	};
	auditRows = [];
	updates = [];
	metadataUpdates = [];
});

function put(body: Row) {
	return PUT(
		new NextRequest(`http://localhost/api/admin/employees/${EMPLOYEE}`, {
			method: 'PUT',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(body),
		}),
		{params: Promise.resolve({id: EMPLOYEE})}
	);
}

function post(body: Row) {
	return POST(
		new NextRequest('http://localhost/api/admin/employees', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify(body),
		})
	);
}

function assertNothingWritten() {
	assert.deepEqual(updates, [], 'no employee/role row may be written');
	assert.deepEqual(metadataUpdates, [], 'Clerk metadata must not change');
}

// --- PUT /api/admin/employees/[id] ------------------------------------------

test('PUT: staff cannot promote their own record to admin', async () => {
	targetEmployee = {...targetEmployee, clerkUserId: CALLER, email: CALLER_EMAIL};

	const res = await put({name: 'Me', email: CALLER_EMAIL, role: 'admin', locations: ['Maple House']});

	assert.equal(res.status, 403);
	assertNothingWritten();
	assert.equal(auditRows[0]?.event, 'access_denied');
});

test("PUT: staff cannot edit someone else's record by echoing their email", async () => {
	const res = await put({
		name: 'Pat Doe',
		email: 'pat@example.test',
		role: 'admin',
		locations: ['Maple House', 'Oak'],
	});

	assert.equal(res.status, 403);
	assertNothingWritten();
});

test('PUT: staff cannot save even their own name through the admin route', async () => {
	targetEmployee = {...targetEmployee, clerkUserId: CALLER, email: CALLER_EMAIL};

	const res = await put({name: 'New Name', email: CALLER_EMAIL, role: 'staff', locations: ['Maple House']});

	assert.equal(res.status, 403);
	assertNothingWritten();
});

test('PUT: a manage_employees supervisor can change a staff role and locations', async () => {
	callerRole = {role: 'supervisor', locations: ['Maple House']};
	callerHasManageEmployees = true;

	const res = await put({
		name: 'Pat Doe',
		email: 'pat@example.test',
		role: 'supervisor',
		locations: ['Maple House', 'Oak'],
	});

	assert.equal(res.status, 200);
	const roleUpdate = updates.find((u) => u.table === schema.roles);
	assert.deepEqual(roleUpdate?.values, {role: 'supervisor', locations: ['Maple House', 'Oak']});
	assert.equal(metadataUpdates[0]?.userId, 'someone-else');
});

test('PUT: a manage_employees supervisor cannot mint an admin', async () => {
	callerRole = {role: 'supervisor', locations: ['Maple House']};
	callerHasManageEmployees = true;

	const res = await put({name: 'Pat Doe', email: 'pat@example.test', role: 'admin', locations: []});

	assert.equal(res.status, 403);
	assert.match((await res.json()).error, /admin/);
	assertNothingWritten();
});

test("PUT: a manage_employees supervisor cannot edit an admin's record", async () => {
	callerRole = {role: 'supervisor', locations: ['Maple House']};
	callerHasManageEmployees = true;
	targetEmployee = {...targetEmployee, role: 'admin'};

	const res = await put({name: 'Pat Doe', email: 'pat@example.test', role: 'staff', locations: []});

	assert.equal(res.status, 403);
	assertNothingWritten();
});

test('PUT: a manage_employees supervisor cannot widen their own locations', async () => {
	callerRole = {role: 'supervisor', locations: ['Maple House']};
	callerHasManageEmployees = true;
	targetEmployee = {...targetEmployee, clerkUserId: CALLER, role: 'supervisor'};

	const res = await put({
		name: 'Me',
		email: CALLER_EMAIL,
		role: 'supervisor',
		locations: ['Maple House', 'Oak'],
	});

	assert.equal(res.status, 403);
	assertNothingWritten();
});

test('PUT: an admin can grant the admin role', async () => {
	callerRole = {role: 'admin', locations: []};

	const res = await put({name: 'Pat Doe', email: 'pat@example.test', role: 'admin', locations: []});

	assert.equal(res.status, 200);
	const roleUpdate = updates.find((u) => u.table === schema.roles);
	assert.equal(roleUpdate?.values.role, 'admin');
});

// --- POST /api/admin/employees ----------------------------------------------

test('POST: staff cannot create an employee record for their own email', async () => {
	const res = await post({name: 'Me', email: CALLER_EMAIL, role: 'admin', locations: []});

	assert.equal(res.status, 403);
	assert.equal(auditRows[0]?.event, 'access_denied');
});

test('POST: a manage_employees supervisor cannot create an admin', async () => {
	callerRole = {role: 'supervisor', locations: ['Maple House']};
	callerHasManageEmployees = true;

	const res = await post({name: 'New Admin', email: 'new@example.test', role: 'admin', locations: []});

	assert.equal(res.status, 403);
});
