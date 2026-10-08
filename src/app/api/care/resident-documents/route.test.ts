/**
 * DB-free tests for the resident-documents write handlers.
 *
 * POST and DELETE used to check only that the caller was signed in to Clerk, so
 * any signed-in user could attach a row to any resident (pointing at any storage
 * key) or delete any row by id. These drive the real handlers with db/index and
 * Clerk stubbed, so the role check, the location scope, the storage-key check
 * and the audit trail are verified on every plain `node --test` run. The
 * route.integration.test.ts next to this file covers GET against a real database.
 *
 * Run with --experimental-test-module-mocks (see the test:care-access script).
 */
import assert from 'node:assert/strict';
import test, {before, beforeEach, mock} from 'node:test';
import {pathToFileURL} from 'node:url';

const LOCATION_A = 'Location A';
const LOCATION_B = 'Location B';
const RESIDENT = '5a000000-0000-4000-8000-000000000001';
const DOCUMENT = '5b000000-0000-4000-8000-000000000001';
const CALLER = 'clerk-user-under-test';
const VALID_KEY = 'resident-documents/1700000000000-abc123-consent.pdf';

type Row = Record<string, unknown>;

let roleRow: {role: string; locations: string[]} | undefined;
let residentRow: {location: string} | undefined;
let documentRow: {residentId: string} | undefined;
let auditRows: Row[];
let insertedDocuments: Row[];
let deleteCount: number;

let schema: typeof import('../../../../../db/schema');
let POST: (typeof import('./route'))['POST'];
let DELETE: (typeof import('./route'))['DELETE'];
let NextRequest: (typeof import('next/server'))['NextRequest'];

before(async () => {
	schema = await import('../../../../../db/schema');

	mock.module('../../../../../db/index', {
		namedExports: {
			db: {
				query: {
					roles: {findFirst: async () => roleRow},
					employees: {findFirst: async () => undefined},
					residents: {findFirst: async () => residentRow},
					residentDocuments: {findFirst: async () => documentRow},
				},
				insert: (table: unknown) => ({
					values: (row: Row) => {
						if (table === schema.auditLogs) {
							auditRows.push(row);
							return Promise.resolve();
						}
						assert.equal(table, schema.residentDocuments, 'unexpected insert');
						insertedDocuments.push(row);
						return {returning: async () => [{id: DOCUMENT, ...row}]};
					},
				}),
				delete: (table: unknown) => ({
					where: async () => {
						assert.equal(table, schema.residentDocuments, 'unexpected delete');
						deleteCount++;
					},
				}),
			},
		},
	});

	// tsx loads the route as CommonJS, so its import of @clerk/nextjs/server
	// resolves to Clerk's CJS build. A bare-specifier mock resolves to the ESM
	// build instead and never intercepts, so mock the file the route requires.
	mock.module(pathToFileURL(require.resolve('@clerk/nextjs/server')).href, {
		namedExports: {
			auth: async () => ({userId: CALLER}),
			currentUser: async () => ({
				id: CALLER,
				firstName: 'Test',
				lastName: 'Caller',
				emailAddresses: [{emailAddress: 'caller@example.test'}],
			}),
		},
	});

	({POST, DELETE} = await import('./route'));
	({NextRequest} = await import('next/server'));
});

beforeEach(() => {
	roleRow = {role: 'staff', locations: [LOCATION_A]};
	residentRow = {location: LOCATION_A};
	documentRow = {residentId: RESIDENT};
	auditRows = [];
	insertedDocuments = [];
	deleteCount = 0;
});

function request(method: 'POST' | 'DELETE', body: Row) {
	return new NextRequest('http://localhost/api/care/resident-documents', {
		method,
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(body),
	});
}

function createBody(overrides: Row = {}) {
	return {
		residentId: RESIDENT,
		title: 'Consent form',
		type: 'consent',
		fileStorageId: VALID_KEY,
		fileName: 'consent.pdf',
		fileSize: 100,
		contentType: 'application/pdf',
		...overrides,
	};
}

// --- POST -------------------------------------------------------------------

test('POST: staff can attach a document to a resident in their location', async () => {
	const res = await POST(request('POST', createBody()));

	assert.equal(res.status, 200);
	assert.equal(insertedDocuments.length, 1);
	assert.equal(insertedDocuments[0].residentId, RESIDENT);
	assert.deepEqual(auditRows, []);
});

test('POST: a resident in another location is refused, audited, and nothing is written', async () => {
	residentRow = {location: LOCATION_B};

	const res = await POST(request('POST', createBody()));

	assert.equal(res.status, 403);
	assert.deepEqual(await res.json(), {error: 'Access denied'});
	assert.equal(insertedDocuments.length, 0);
	assert.equal(auditRows.length, 1);
	assert.equal(auditRows[0].event, 'access_denied');
	assert.equal(
		auditRows[0].details,
		`resident_documents_create_cross_location_${RESIDENT}`
	);
});

test('POST: a signed-in user with no care role gets 403, not 500', async () => {
	roleRow = undefined;

	const res = await POST(request('POST', createBody()));

	assert.equal(
		res.status,
		403,
		'AccessDeniedError from requireCareAccess must map to 403, not fall through to 500'
	);
	assert.equal(insertedDocuments.length, 0);
});

test('POST: a storage key outside resident-documents/ is rejected', async () => {
	for (const fileStorageId of [
		'hr_doc/1700000000000-abc123-i9.pdf',
		'resident-documents/../hr_doc/1700000000000-abc123-i9.pdf',
		'resident-documents/',
		'prefix-resident-documents/x.pdf',
	]) {
		const res = await POST(request('POST', createBody({fileStorageId})));
		assert.equal(res.status, 400, `${fileStorageId} must be refused`);
	}
	assert.equal(insertedDocuments.length, 0);
});

test('POST: an admin may attach a document to a resident in any location', async () => {
	roleRow = {role: 'admin', locations: []};
	residentRow = {location: LOCATION_B};

	const res = await POST(request('POST', createBody()));

	assert.equal(res.status, 200);
	assert.equal(insertedDocuments.length, 1);
});

// --- DELETE -----------------------------------------------------------------

test('DELETE: staff can delete a document for a resident in their location', async () => {
	const res = await DELETE(request('DELETE', {documentId: DOCUMENT}));

	assert.equal(res.status, 200);
	assert.equal(deleteCount, 1);
});

test('DELETE: a document for a resident in another location is refused and audited', async () => {
	residentRow = {location: LOCATION_B};

	const res = await DELETE(request('DELETE', {documentId: DOCUMENT}));

	assert.equal(res.status, 403);
	assert.equal(deleteCount, 0);
	assert.equal(auditRows.length, 1);
	assert.equal(
		auditRows[0].details,
		`resident_documents_delete_cross_location_${RESIDENT}`
	);
});

test('DELETE: a signed-in user with no care role gets 403 and deletes nothing', async () => {
	roleRow = {role: 'inspector', locations: [LOCATION_A]};

	const res = await DELETE(request('DELETE', {documentId: DOCUMENT}));

	assert.equal(res.status, 403);
	assert.equal(deleteCount, 0);
});

test('DELETE: a missing document looks the same as a denied one to a non-admin', async () => {
	documentRow = undefined;

	const res = await DELETE(request('DELETE', {documentId: DOCUMENT}));

	assert.equal(
		res.status,
		403,
		'a 404/403 split would let a caller probe which document ids exist elsewhere'
	);
	assert.equal(deleteCount, 0);
	assert.equal(auditRows.length, 1);
});

test('DELETE: a missing document is a 404 for an admin', async () => {
	roleRow = {role: 'admin', locations: []};
	documentRow = undefined;

	const res = await DELETE(request('DELETE', {documentId: DOCUMENT}));

	assert.equal(res.status, 404);
	assert.equal(deleteCount, 0);
});
