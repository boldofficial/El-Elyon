/**
 * Regression test for a broken-access-control bug in the incidents GET handler:
 * it fetched `userRole` via requireCareAccess() but never used it to restrict
 * results by role or location. Any authenticated user who passed
 * requireCareAccess could omit all filters to list every incident report
 * system-wide, or pass an arbitrary `location` to pull reports for a facility
 * they aren't assigned to.
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

const LOCATION_A = 'Test Location A - incidents';
const LOCATION_B = 'Test Location B - incidents';
const RESIDENT_A = '5f000000-0000-4000-8000-000000000001';
const RESIDENT_B = '5f000000-0000-4000-8000-000000000002';
const INCIDENT_A = '5e000000-0000-4000-8000-000000000001';
const INCIDENT_B = '5e000000-0000-4000-8000-000000000002';
const STAFF_USER = 'test-clerk-user-incidents-scoped-to-a';
const ADMIN_USER = 'test-clerk-user-incidents-admin';

function normalize(url: string | undefined) {
	if (!url) return undefined;
	return url.trim().replace(/\/$/, '').toLowerCase();
}

const skip = !TEST_DATABASE_URL
	? 'Set CARE_ACCESS_TEST_DATABASE_URL to a throwaway Neon database (see file header)'
	: false;

let pool: Pool;
let GET: (typeof import('./route'))['GET'];

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

	pool = new Pool({connectionString: TEST_DATABASE_URL, max: 2});
	await seed();
});

after(async () => {
	if (skip || !pool) return;
	await cleanup();
	await pool.end();
});

async function cleanup() {
	await pool.query('delete from incident_reports where id = any($1::uuid[])', [
		[INCIDENT_A, INCIDENT_B],
	]);
	await pool.query('delete from residents where id = any($1::uuid[])', [
		[RESIDENT_A, RESIDENT_B],
	]);
	await pool.query('delete from roles where clerk_user_id = any($1::varchar[])', [
		[STAFF_USER, ADMIN_USER],
	]);
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
		 values ($1, 'staff', $2::jsonb), ($3, 'admin', '[]'::jsonb)`,
		[STAFF_USER, JSON.stringify([LOCATION_A]), ADMIN_USER]
	);

	await pool.query(
		`insert into incident_reports
		   (id, resident_id, reported_by, incident_date, incident_type, severity,
		    location, description)
		 values
		   ($1, $3, 'tester', now(), 'other', 'low', $5, 'incident at location A'),
		   ($2, $4, 'tester', now(), 'other', 'low', $6, 'incident at location B')`,
		[INCIDENT_A, INCIDENT_B, RESIDENT_A, RESIDENT_B, LOCATION_A, LOCATION_B]
	);
}

test(
	'non-admin omitting all filters only sees incidents for their assigned location(s)',
	{skip},
	async () => {
		currentUserId = STAFF_USER;
		const res = await GET(new Request('http://localhost/api/care/incidents'));
		assert.equal(res.status, 200);

		const body = await res.json();
		const ids = body.map((r: any) => r.id);
		assert.ok(ids.includes(INCIDENT_A));
		assert.ok(
			!ids.includes(INCIDENT_B),
			'a non-admin with no filters must not see every incident system-wide'
		);
	}
);

test(
	'non-admin cannot pull another location\'s incidents via the location query param',
	{skip},
	async () => {
		currentUserId = STAFF_USER;
		const res = await GET(
			new Request(`http://localhost/api/care/incidents?location=${encodeURIComponent(LOCATION_B)}`)
		);
		assert.equal(res.status, 200);

		const body = await res.json();
		assert.deepEqual(
			body,
			[],
			'an arbitrary location param outside the caller\'s assignment must not be honored'
		);
	}
);

test(
	'non-admin cannot pull another location\'s incident via residentId',
	{skip},
	async () => {
		currentUserId = STAFF_USER;
		const res = await GET(
			new Request(`http://localhost/api/care/incidents?residentId=${RESIDENT_B}`)
		);
		assert.equal(res.status, 200);

		const body = await res.json();
		assert.deepEqual(body, []);
	}
);

test(
	'non-admin can still read their own location\'s incident by residentId',
	{skip},
	async () => {
		currentUserId = STAFF_USER;
		const res = await GET(
			new Request(`http://localhost/api/care/incidents?residentId=${RESIDENT_A}`)
		);
		assert.equal(res.status, 200);

		const body = await res.json();
		assert.deepEqual(body.map((r: any) => r.id), [INCIDENT_A]);
	}
);

test('admin with no filters still sees incidents across all locations', {skip}, async () => {
	currentUserId = ADMIN_USER;
	const res = await GET(new Request('http://localhost/api/care/incidents'));
	assert.equal(res.status, 200);

	const body = await res.json();
	const ids = body.map((r: any) => r.id);
	assert.ok(ids.includes(INCIDENT_A) && ids.includes(INCIDENT_B));
});
