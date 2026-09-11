/**
 * Regression test for a broken-access-control bug in the resident-documents GET
 * handler: the non-admin location-scoping check only ran in the branch where
 * `residentId` was absent from the query string. When `residentId` was present,
 * the generic-documents, ISP-files, and fire-evac subqueries were filtered only
 * by residentId, with no check that the resident's location was one the caller
 * is assigned to -- so a non-admin staff/supervisor could pass any other
 * facility's residentId and read that resident's documents.
 *
 * This drives the REAL route handler (auth() mocked, everything else real)
 * against a REAL database so the fix is verified end-to-end rather than by
 * re-reading the query-building code that had the bug in the first place.
 *
 * Requirements:
 *   CARE_ACCESS_TEST_DATABASE_URL must point at a THROWAWAY Neon database or
 *   branch. It must be a Neon endpoint (drizzle-orm/neon-http), not a local
 *   Postgres -- db/index.ts speaks Neon's SQL-over-HTTP protocol.
 *
 *   Run with --experimental-test-module-mocks (see package.json's
 *   test:care-access:db script), which node:test needs to mock
 *   @clerk/nextjs/server's auth() export.
 */
import assert from 'node:assert/strict';
import test, {after, before, mock} from 'node:test';

import {Pool} from 'pg';

const TEST_DATABASE_URL = process.env.CARE_ACCESS_TEST_DATABASE_URL;
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;

const LOCATION_A = 'Test Location A - resident-documents';
const LOCATION_B = 'Test Location B - resident-documents';
const RESIDENT_A = '5a000000-0000-4000-8000-000000000001';
const RESIDENT_B = '5a000000-0000-4000-8000-000000000002';
const DOC_A = '5b000000-0000-4000-8000-000000000001';
const DOC_B = '5b000000-0000-4000-8000-000000000002';
const ISP_A = '5c000000-0000-4000-8000-000000000001';
const ISP_B = '5c000000-0000-4000-8000-000000000002';
const FIRE_A = '5d000000-0000-4000-8000-000000000001';
const FIRE_B = '5d000000-0000-4000-8000-000000000002';
const STAFF_USER = 'test-clerk-user-docs-scoped-to-a';

function normalize(url: string | undefined) {
	if (!url) return undefined;
	return url.trim().replace(/\/$/, '').toLowerCase();
}

const skip = !TEST_DATABASE_URL
	? 'Set CARE_ACCESS_TEST_DATABASE_URL to a throwaway Neon database (see file header)'
	: false;

let pool: Pool;
let GET: (typeof import('./route'))['GET'];
let NextRequest: (typeof import('next/server'))['NextRequest'];

// Read by the mocked auth() below so each test can act as a different caller.
let currentUserId: string | null = null;

before(async () => {
	if (skip) return;

	if (PRODUCTION_DATABASE_URL) {
		assert.notEqual(
			normalize(TEST_DATABASE_URL),
			normalize(PRODUCTION_DATABASE_URL),
			'CARE_ACCESS_TEST_DATABASE_URL must not equal DATABASE_URL'
		);
	} else {
		assert.equal(
			process.env.ALLOW_UNVERIFIED_TEST_DB,
			'1',
			'DATABASE_URL is not set, so CARE_ACCESS_TEST_DATABASE_URL cannot be compared ' +
				'against production. Either set DATABASE_URL alongside it, or set ' +
				'ALLOW_UNVERIFIED_TEST_DB=1 to confirm the test URL is a throwaway database.'
		);
	}

	for (const key of [
		'AWS_REGION',
		'AWS_ENDPOINT_URL',
		'AWS_ACCESS_KEY_ID',
		'AWS_SECRET_ACCESS_KEY',
		'AWS_S3_BUCKET_NAME',
		'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
		'CLERK_SECRET_KEY',
	]) {
		process.env[key] ||= 'test-placeholder';
	}

	// The route imports auth() from @clerk/nextjs/server at module load, so it
	// has to be mocked before the route module is imported below.
	mock.module('@clerk/nextjs/server', {
		namedExports: {
			auth: async () => ({userId: currentUserId}),
			currentUser: async () => null,
		},
	});

	process.env.DATABASE_URL = TEST_DATABASE_URL;

	({GET} = await import('./route'));
	({NextRequest} = await import('next/server'));

	pool = new Pool({connectionString: TEST_DATABASE_URL, max: 2});
	await seed();
});

after(async () => {
	if (skip || !pool) return;
	await cleanup();
	await pool.end();
});

async function cleanup() {
	await pool.query('delete from resident_documents where id = any($1::uuid[])', [
		[DOC_A, DOC_B],
	]);
	await pool.query('delete from isp_files where id = any($1::uuid[])', [
		[ISP_A, ISP_B],
	]);
	await pool.query('delete from fire_evac where id = any($1::uuid[])', [
		[FIRE_A, FIRE_B],
	]);
	await pool.query('delete from residents where id = any($1::uuid[])', [
		[RESIDENT_A, RESIDENT_B],
	]);
	await pool.query('delete from roles where clerk_user_id = $1', [STAFF_USER]);
	await pool.query('delete from audit_logs where clerk_user_id = $1', [STAFF_USER]);
}

async function seed() {
	await cleanup();

	await pool.query(
		`insert into residents (id, name, location, date_of_birth)
		 values ($1, 'Test Resident A', $3, '1990-01-01'),
		        ($2, 'Test Resident B', $4, '1990-01-01')`,
		[RESIDENT_A, RESIDENT_B, LOCATION_A, LOCATION_B]
	);

	await pool.query(
		`insert into roles (clerk_user_id, role, locations)
		 values ($1, 'staff', $2::jsonb)`,
		[STAFF_USER, JSON.stringify([LOCATION_A])]
	);

	await pool.query(
		`insert into resident_documents
		   (id, resident_id, title, type, file_storage_id, file_name, file_size,
		    content_type, uploaded_by)
		 values
		   ($1, $3, 'Doc A', 'other', 'storage-a', 'a.pdf', 100, 'application/pdf', 'tester'),
		   ($2, $4, 'Doc B', 'other', 'storage-b', 'b.pdf', 100, 'application/pdf', 'tester')`,
		[DOC_A, DOC_B, RESIDENT_A, RESIDENT_B]
	);

	await pool.query(
		`insert into isp_files
		   (id, resident_id, version_label, effective_date, status, file_storage_id,
		    file_name, file_size, content_type, uploaded_by, uploaded_at)
		 values
		   ($1, $3, 'v1', now(), 'active', 'storage-a', 'isp-a.pdf', 100, 'application/pdf', 'tester', now()),
		   ($2, $4, 'v1', now(), 'active', 'storage-b', 'isp-b.pdf', 100, 'application/pdf', 'tester', now())`,
		[ISP_A, ISP_B, RESIDENT_A, RESIDENT_B]
	);

	await pool.query(
		`insert into fire_evac (id, resident_id, location, version)
		 values ($1, $3, $5, 1), ($2, $4, $6, 1)`,
		[FIRE_A, FIRE_B, RESIDENT_A, RESIDENT_B, LOCATION_A, LOCATION_B]
	);
}

test(
	'non-admin cannot read another location\'s resident documents by passing its residentId (IDOR)',
	{skip},
	async () => {
		currentUserId = STAFF_USER;
		const req = new NextRequest(
			`http://localhost/api/care/resident-documents?residentId=${RESIDENT_B}`
		);

		const res = await GET(req);
		assert.equal(
			res.status,
			403,
			'a resident outside the assigned locations of the caller must be ' +
				'refused outright -- an empty 200 is indistinguishable from a ' +
				'resident who simply has no documents, which hides the denial'
		);

		const body = await res.json();
		assert.deepEqual(body, {error: 'Access denied'});

		// The denial must leave a trail; a silent refusal is how the original
		// IDOR stayed invisible for as long as it did.
		const audit = await pool.query(
			`select details from audit_logs
			   where clerk_user_id = $1 and event = 'access_denied'
			     and details like 'resident_documents_cross_location%'`,
			[STAFF_USER]
		);
		assert.equal(audit.rowCount, 1, 'cross-location access must be audited');
		assert.ok(audit.rows[0].details.includes(RESIDENT_B));
	}
);

test(
	'non-admin can still read their own location\'s resident documents by residentId',
	{skip},
	async () => {
		currentUserId = STAFF_USER;
		const req = new NextRequest(
			`http://localhost/api/care/resident-documents?residentId=${RESIDENT_A}`
		);

		const res = await GET(req);
		assert.equal(res.status, 200);

		const body = await res.json();
		const ids = body.map((d: any) => d.id).sort();
		assert.deepEqual(ids, [DOC_A, FIRE_A, ISP_A].sort());
	}
);

test(
	'non-admin listing without residentId stays scoped to assigned locations (sanity check)',
	{skip},
	async () => {
		currentUserId = STAFF_USER;
		const req = new NextRequest('http://localhost/api/care/resident-documents');

		const res = await GET(req);
		assert.equal(res.status, 200);

		const body = await res.json();
		const ids = body.map((d: any) => d.id);
		assert.ok(ids.includes(DOC_A) && ids.includes(ISP_A) && ids.includes(FIRE_A));
		assert.ok(!ids.includes(DOC_B) && !ids.includes(ISP_B) && !ids.includes(FIRE_B));
	}
);
