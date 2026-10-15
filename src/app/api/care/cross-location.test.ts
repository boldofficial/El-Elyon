/**
 * DB-free tests for the location checks on the older care routes.
 *
 * These routes used to check only the caller's role (or, for search-logs and
 * resident-isp-status, only that they were signed in), so staff at one home
 * could read residents, logs and incident reports from every other home, and
 * any staff member could delete any incident report. These drive the real
 * handlers with db/index and Clerk stubbed so the scope rules run on every
 * plain `node --test` run.
 *
 * Run with --experimental-test-module-mocks (see the test:care-access script).
 */
import assert from 'node:assert/strict';
import test, {before, beforeEach, mock} from 'node:test';
import {pathToFileURL} from 'node:url';
import {PgDialect} from 'drizzle-orm/pg-core';
import type {SQL} from 'drizzle-orm';

const LOCATION_A = 'Location A';
const LOCATION_B = 'Location B';
const RESIDENT = '6a000000-0000-4000-8000-000000000001';
const REPORT = '6b000000-0000-4000-8000-000000000001';
const LOG = '6c000000-0000-4000-8000-000000000001';
const CALLER = 'clerk-user-under-test';

type Row = Record<string, unknown>;

let roleRow: {role: string; locations: string[]} | undefined;
let residentRow: {location: string} | undefined;
let reportRow: Row | undefined;
let auditRows: Row[];
let insertedLogs: Row[];
let incidentDeletes: number;
let residentQueries: (SQL | undefined)[];
let logQueries: (SQL | undefined)[];

let schema: typeof import('../../../../db/schema');
let NextRequest: (typeof import('next/server'))['NextRequest'];
let searchLogs: (typeof import('./search-logs/route'))['GET'];
let listResidents: (typeof import('../residents/route'))['GET'];
let ispStatus: (typeof import('./resident-isp-status/route'))['GET'];
let incidentRoute: typeof import('./incidents/[reportId]/route');
let residentLogsRoute: typeof import('./residents/[id]/logs/route');

const dialect = new PgDialect();
function params(where: SQL | undefined) {
	return where ? dialect.sqlToQuery(where).params : [];
}

before(async () => {
	schema = await import('../../../../db/schema');

	mock.module('../../../../db/index', {
		namedExports: {
			db: {
				query: {
					roles: {findFirst: async () => roleRow},
					employees: {findFirst: async () => ({name: 'Real Author', locations: []})},
					residents: {
						findFirst: async () => residentRow,
						findMany: async (args?: {where?: SQL}) => {
							residentQueries.push(args?.where);
							return [];
						},
					},
					residentLogs: {
						findMany: async (args?: {where?: SQL}) => {
							logQueries.push(args?.where);
							return [];
						},
					},
					incidentReports: {findFirst: async () => reportRow},
					isp: {findFirst: async () => undefined},
				},
				insert: (table: unknown) => ({
					values: (row: Row | Row[]) => {
						if (table === schema.auditLogs) {
							auditRows.push(row as Row);
							return Promise.resolve();
						}
						assert.equal(table, schema.residentLogs, 'unexpected insert');
						insertedLogs.push(row as Row);
						return {returning: async () => [{id: LOG, ...(row as Row)}]};
					},
				}),
				delete: (table: unknown) => ({
					where: async () => {
						assert.equal(table, schema.incidentReports, 'unexpected delete');
						incidentDeletes++;
					},
				}),
			},
		},
	});

	// See resident-documents/route.test.ts: mock the CJS build the routes load.
	mock.module(pathToFileURL(require.resolve('@clerk/nextjs/server')).href, {
		namedExports: {
			auth: async () => ({userId: CALLER}),
			currentUser: async () => ({id: CALLER}),
			clerkClient: async () => ({users: {getUser: async () => ({})}}),
		},
	});

	({NextRequest} = await import('next/server'));
	({GET: searchLogs} = await import('./search-logs/route'));
	({GET: listResidents} = await import('../residents/route'));
	({GET: ispStatus} = await import('./resident-isp-status/route'));
	incidentRoute = await import('./incidents/[reportId]/route');
	residentLogsRoute = await import('./residents/[id]/logs/route');
});

beforeEach(() => {
	roleRow = {role: 'staff', locations: [LOCATION_A]};
	residentRow = {location: LOCATION_A};
	reportRow = {id: REPORT, residentId: RESIDENT, location: LOCATION_A};
	auditRows = [];
	insertedLogs = [];
	incidentDeletes = 0;
	residentQueries = [];
	logQueries = [];
});

function get(url: string) {
	return new NextRequest(`http://localhost${url}`);
}

function deniedAudits() {
	return auditRows.filter((row) => row.event === 'access_denied');
}

// --- search-logs ------------------------------------------------------------

test('search-logs: staff only search logs from their own locations', async () => {
	const res = await searchLogs(get('/api/care/search-logs?query=fall'));

	assert.equal(res.status, 200);
	assert.equal(logQueries.length, 1);
	const bound = params(logQueries[0]);
	assert.ok(bound.includes(LOCATION_A), 'query is filtered to the caller location');
	assert.ok(!bound.includes(LOCATION_B));
});

test('search-logs: a signed-in user with no care role gets 403 and no query runs', async () => {
	roleRow = undefined;

	const res = await searchLogs(get('/api/care/search-logs'));

	assert.equal(res.status, 403);
	assert.equal(logQueries.length, 0);
});

test('search-logs: a resident in another location is refused and audited', async () => {
	residentRow = {location: LOCATION_B};

	const res = await searchLogs(get(`/api/care/search-logs?residentId=${RESIDENT}`));

	assert.equal(res.status, 403);
	assert.equal(logQueries.length, 0);
	assert.equal(deniedAudits().length, 1);
});

test('search-logs: admins search every location', async () => {
	roleRow = {role: 'admin', locations: []};

	const res = await searchLogs(get('/api/care/search-logs'));

	assert.equal(res.status, 200);
	assert.equal(logQueries[0], undefined);
});

// --- /api/residents -----------------------------------------------------------

test('residents: staff only get residents in their own locations', async () => {
	const res = await listResidents();

	assert.equal(res.status, 200);
	assert.equal(residentQueries.length, 1);
	assert.deepEqual(params(residentQueries[0]), [LOCATION_A]);
});

test('residents: staff with no assigned location get an empty list', async () => {
	roleRow = {role: 'staff', locations: []};

	const res = await listResidents();

	assert.equal(res.status, 200);
	assert.deepEqual(await res.json(), []);
	assert.equal(residentQueries.length, 0);
});

test('residents: admins get every resident', async () => {
	roleRow = {role: 'admin', locations: []};

	await listResidents();

	assert.equal(residentQueries[0], undefined);
});

// --- resident-isp-status ------------------------------------------------------

test('resident-isp-status: a resident in another location is refused', async () => {
	residentRow = {location: LOCATION_B};

	const res = await ispStatus(get(`/api/care/resident-isp-status?residentId=${RESIDENT}`));

	assert.equal(res.status, 403);
	assert.equal(deniedAudits().length, 1);
});

test('resident-isp-status: a signed-in user with no care role gets 403', async () => {
	roleRow = undefined;

	const res = await ispStatus(get(`/api/care/resident-isp-status?residentId=${RESIDENT}`));

	assert.equal(res.status, 403);
});

// --- incident reports ---------------------------------------------------------

const reportParams = () => ({params: Promise.resolve({reportId: REPORT})});

test('incident GET: a report for a resident in another location is refused', async () => {
	residentRow = {location: LOCATION_B};

	const res = await incidentRoute.GET(get(`/api/care/incidents/${REPORT}`), reportParams());

	assert.equal(res.status, 403);
});

test('incident DELETE: staff cannot delete an incident report', async () => {
	const res = await incidentRoute.DELETE(
		get(`/api/care/incidents/${REPORT}`),
		reportParams()
	);

	assert.equal(res.status, 403);
	assert.equal(incidentDeletes, 0);
});

test('incident DELETE: supervisors cannot delete an incident report either', async () => {
	roleRow = {role: 'supervisor', locations: [LOCATION_A]};

	const res = await incidentRoute.DELETE(
		get(`/api/care/incidents/${REPORT}`),
		reportParams()
	);

	assert.equal(res.status, 403);
	assert.equal(incidentDeletes, 0);
});

test('incident DELETE: admins can delete an incident report', async () => {
	roleRow = {role: 'admin', locations: []};

	const res = await incidentRoute.DELETE(
		get(`/api/care/incidents/${REPORT}`),
		reportParams()
	);

	assert.equal(res.status, 200);
	assert.equal(incidentDeletes, 1);
});

// --- /api/care/residents/[id]/logs ----------------------------------------------

const residentParams = () => ({params: Promise.resolve({id: RESIDENT})});

function post(url: string, body: Row) {
	return new NextRequest(`http://localhost${url}`, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(body),
	});
}

test('resident logs GET: a resident in another location is refused', async () => {
	residentRow = {location: LOCATION_B};

	const res = await residentLogsRoute.GET(
		get(`/api/care/residents/${RESIDENT}/logs`),
		residentParams()
	);

	assert.equal(res.status, 403);
	assert.equal(logQueries.length, 0);
});

test('resident logs POST: location and author come from the server, not the body', async () => {
	const res = await residentLogsRoute.POST(
		post(`/api/care/residents/${RESIDENT}/logs`, {
			content: 'Ate lunch',
			location: LOCATION_B,
			authorName: 'Someone Else',
			activities: [],
		}),
		residentParams()
	);

	assert.equal(res.status, 201);
	assert.equal(insertedLogs.length, 1);
	assert.equal(insertedLogs[0].location, LOCATION_A);
	assert.equal(insertedLogs[0].authorName, 'Real Author');
	assert.equal(insertedLogs[0].authorId, CALLER);
});

test('resident logs POST: a resident in another location is refused and nothing is written', async () => {
	residentRow = {location: LOCATION_B};

	const res = await residentLogsRoute.POST(
		post(`/api/care/residents/${RESIDENT}/logs`, {content: 'x', activities: []}),
		residentParams()
	);

	assert.equal(res.status, 403);
	assert.equal(insertedLogs.length, 0);
});
