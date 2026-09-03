/**
 * Integration test for the resident/guardian delete paths.
 *
 * This test exists because of a bug that shipped unnoticed: every mutation that
 * called db.transaction() threw "No transactions support in neon-http driver"
 * the moment it ran, and nothing in the repo would have caught it. The existing
 * db/life-safety.integration.test.ts opens its own raw pg.Pool and never touches
 * the exported db client, so it could not have.
 *
 * So this test deliberately drives the REAL db client from db/index.ts through
 * the REAL deleteResident/deleteGuardian mutations. Assertions are made over a
 * separate pg connection, so the code under test is never also the code
 * verifying itself.
 *
 * Requirements:
 *   TEST_DATABASE_URL must point at a THROWAWAY Neon database or branch.
 *
 * It must be a Neon endpoint, not a local Postgres: db/index.ts connects with
 * drizzle-orm/neon-http, which speaks Neon's SQL-over-HTTP protocol. A plain
 * local postgres:// URL will not work for the client under test.
 *
 * The test refuses to run if TEST_DATABASE_URL matches DATABASE_URL, and only
 * ever touches rows with the fixed UUIDs below, which it removes afterwards.
 */
import assert from 'node:assert/strict';
import test, {after, before} from 'node:test';

import {Pool} from 'pg';

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;

// Fixed ids so cleanup is exact and this can never touch real records.
const RESIDENT_A = '4a000000-0000-4000-8000-000000000001';
const RESIDENT_B = '4a000000-0000-4000-8000-000000000002';
const GUARDIAN_A = '4b000000-0000-4000-8000-000000000001';
const UNRELATED_RESIDENT = '4a000000-0000-4000-8000-0000000000ff';
const ORPHAN_RESIDENT = '4a000000-0000-4000-8000-0000000000aa';
const ALERT_A = '4c000000-0000-4000-8000-000000000001';

function normalize(url: string | undefined) {
	if (!url) return undefined;
	return url.trim().replace(/\/$/, '').toLowerCase();
}

const skip = !TEST_DATABASE_URL
	? 'Set TEST_DATABASE_URL to a throwaway Neon database (see file header)'
	: false;

let pool: Pool;
let db: (typeof import('../index'))['db'];
let deleteResident: (typeof import('./residents'))['deleteResident'];
let deleteGuardian: (typeof import('./guardians'))['deleteGuardian'];
let residents: (typeof import('../schema'))['residents'];
let guardians: (typeof import('../schema'))['guardians'];

before(async () => {
	if (skip) return;

	// Never let this run against production, even by misconfiguration.
	//
	// This test inserts and deletes rows, so it has to be certain it is not
	// pointed at the live database. When DATABASE_URL is present we can prove the
	// two differ. When it is absent there is nothing to compare against and the
	// check would pass vacuously - which is worse than no check, because it looks
	// like protection. So refuse in that case unless the caller has explicitly
	// confirmed the target is disposable.
	if (PRODUCTION_DATABASE_URL) {
		assert.notEqual(
			normalize(TEST_DATABASE_URL),
			normalize(PRODUCTION_DATABASE_URL),
			'TEST_DATABASE_URL must not equal DATABASE_URL'
		);
	} else {
		assert.equal(
			process.env.ALLOW_UNVERIFIED_TEST_DB,
			'1',
			'DATABASE_URL is not set, so TEST_DATABASE_URL cannot be compared against ' +
				'production and the safety check would pass vacuously. Either set ' +
				'DATABASE_URL alongside it, or set ALLOW_UNVERIFIED_TEST_DB=1 to confirm ' +
				'TEST_DATABASE_URL points at a throwaway database.'
		);
	}

	// db/index.ts calls validateEnvironment() on import, which requires these.
	// They are unused by the code under test; stub anything not already set.
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

	// Point the real client at the test database, then import it. This has to be
	// a dynamic import: db/index.ts reads DATABASE_URL at module load.
	process.env.DATABASE_URL = TEST_DATABASE_URL;

	({db} = await import('../index'));
	({deleteResident} = await import('./residents'));
	({deleteGuardian} = await import('./guardians'));
	({residents, guardians} = await import('../schema'));

	pool = new Pool({connectionString: TEST_DATABASE_URL, max: 2});
});

after(async () => {
	if (skip || !pool) return;
	await cleanup();
	await pool.end();
});

async function cleanup() {
	await pool.query('delete from compliance_alerts where id = any($1::uuid[])', [
		[ALERT_A],
	]);
	await pool.query('delete from guardians where id = any($1::uuid[])', [
		[GUARDIAN_A],
	]);
	await pool.query('delete from residents where id = any($1::uuid[])', [
		[RESIDENT_A, RESIDENT_B, UNRELATED_RESIDENT, ORPHAN_RESIDENT],
	]);
}

async function seed() {
	await cleanup();

	await pool.query(
		`insert into residents (id, name, location, date_of_birth)
		 values ($1, 'Test Resident A', 'test-location', '1990-01-01'),
		        ($2, 'Test Resident B', 'test-location', '1990-01-01'),
		        ($3, 'Unrelated',       'test-location', '1990-01-01')`,
		[RESIDENT_A, RESIDENT_B, UNRELATED_RESIDENT]
	);

	// One guardian linked to A, B and an unrelated resident. Only A's id should
	// disappear when A is deleted.
	await pool.query(
		`insert into guardians (id, name, phone, email, resident_ids)
		 values ($1, 'Test Guardian', '555-0100', 'guardian@test.invalid', $2::jsonb)`,
		[GUARDIAN_A, JSON.stringify([RESIDENT_A, RESIDENT_B, UNRELATED_RESIDENT])]
	);

	// Children that must disappear via ON DELETE CASCADE, not via app code.
	await pool.query(
		`insert into resident_logs (resident_id, log_type, content)
		 values ($1, 'daily_notes', 'cascade check')`,
		[RESIDENT_A]
	);
	await pool.query(
		`insert into incident_reports
		   (resident_id, reported_by, incident_date, incident_type,
		    severity, location, description)
		 values ($1, 'test-user', now(), 'other',
		         'low', 'test-location', 'cascade check')`,
		[RESIDENT_A]
	);
	await pool.query(
		`insert into fire_evac (resident_id, version) values ($1, 1)`,
		[RESIDENT_A]
	);

	// Referenced only through a JSONB blob, so no FK can clean this up.
	await pool.query(
		`insert into compliance_alerts
		   (id, type, title, description, location,
		    status, severity, active, created_at, metadata)
		 values ($1, 'test', 'Test alert', 'cascade check', 'test-location',
		         'open', 'low', true, now(), $2::jsonb)`,
		[ALERT_A, JSON.stringify({residentId: RESIDENT_A})]
	);
}

async function count(sqlText: string, params: unknown[]) {
	const {rows} = await pool.query(sqlText, params);
	return Number(rows[0].count);
}

/**
 * deleteResident no longer deletes child rows by hand - it relies on the
 * database's ON DELETE CASCADE constraints. That is only safe while EVERY
 * foreign key pointing at residents actually cascades. A new table added
 * without one would not break any other test here (the fixtures below only
 * populate a handful of tables), but it would break deletion in production the
 * first time a real resident had a row in it.
 *
 * So assert the property directly rather than table by table.
 */
test('every foreign key referencing residents cascades on delete', {skip}, async () => {
	const {rows} = await pool.query(`
		select conrelid::regclass::text as child_table, confdeltype
		  from pg_constraint
		 where confrelid = 'residents'::regclass
		   and contype = 'f'
		 order by 1
	`);

	assert.ok(rows.length > 0, 'expected some foreign keys referencing residents');

	const notCascading = rows
		.filter((r) => r.confdeltype !== 'c')
		.map((r) => r.child_table);

	assert.deepEqual(
		notCascading,
		[],
		'These tables reference residents WITHOUT ON DELETE CASCADE, so deleting a ' +
			'resident that has rows in them fails with a foreign key violation: ' +
			notCascading.join(', ')
	);
});

test(
	'deleteResident cascades children and detaches guardians',
	{skip},
	async () => {
		await seed();

		await deleteResident(RESIDENT_A);

		assert.equal(
			await count('select count(*) from residents where id = $1', [RESIDENT_A]),
			0,
			'resident row should be gone'
		);

		// These have ON DELETE CASCADE and are no longer deleted by application
		// code. If a cascade is missing in this database, this is what fails.
		for (const table of ['resident_logs', 'incident_reports', 'fire_evac']) {
			assert.equal(
				await count(`select count(*) from ${table} where resident_id = $1`, [
					RESIDENT_A,
				]),
				0,
				`${table} rows should have been removed by ON DELETE CASCADE`
			);
		}

		assert.equal(
			await count('select count(*) from compliance_alerts where id = $1', [
				ALERT_A,
			]),
			0,
			'compliance alert referencing the resident via JSONB should be deleted'
		);

		const {rows} = await pool.query(
			'select resident_ids from guardians where id = $1',
			[GUARDIAN_A]
		);
		const remaining: string[] = rows[0].resident_ids;
		assert.ok(
			!remaining.includes(RESIDENT_A),
			'deleted resident id should be removed from guardian.resident_ids'
		);
		assert.ok(
			remaining.includes(RESIDENT_B) && remaining.includes(UNRELATED_RESIDENT),
			'other resident ids must be left intact'
		);
	}
);

test(
	'deleteResident throws when the resident does not exist',
	{skip},
	async () => {
		await seed();

		await assert.rejects(
			() => deleteResident('4a000000-0000-4000-8000-00000000dead'),
			/Resident not found/
		);
	}
);

test(
	'concurrent deletes do not resurrect ids in guardian.resident_ids',
	{skip},
	async () => {
		await seed();

		// The old implementation read resident_ids, filtered the array in JS and
		// wrote it back. Two concurrent deletions would each overwrite the other,
		// so one deleted id would reappear. The JSONB minus operator used now has
		// no such window.
		await Promise.all([deleteResident(RESIDENT_A), deleteResident(RESIDENT_B)]);

		const {rows} = await pool.query(
			'select resident_ids from guardians where id = $1',
			[GUARDIAN_A]
		);
		const remaining: string[] = rows[0].resident_ids;

		assert.deepEqual(
			remaining,
			[UNRELATED_RESIDENT],
			'both concurrently deleted ids must be gone; neither may be reinstated'
		);
	}
);

test('a failing batch commits nothing', {skip}, async () => {
	await seed();

	// db.batch() is what replaced db.transaction(). If it were not atomic, the
	// first insert below would survive the second one's primary key violation.
	await assert.rejects(async () => {
		await db.batch([
			db.insert(residents).values({
				id: ORPHAN_RESIDENT,
				name: 'Should not survive',
				location: 'test-location',
				dateOfBirth: '1990-01-01',
			}),
			// Duplicate primary key: this statement must fail.
			db.insert(guardians).values({
				id: GUARDIAN_A,
				name: 'Duplicate guardian',
				phone: '555-0101',
				email: 'dupe@test.invalid',
			}),
		]);
	});

	assert.equal(
		await count('select count(*) from residents where id = $1', [
			ORPHAN_RESIDENT,
		]),
		0,
		'the first statement in a failed batch must have been rolled back'
	);
});

test('deleteGuardian detaches the guardian from residents', {skip}, async () => {
	await seed();

	await deleteGuardian(GUARDIAN_A);

	assert.equal(
		await count('select count(*) from guardians where id = $1', [GUARDIAN_A]),
		0,
		'guardian row should be gone'
	);

	await assert.rejects(
		() => deleteGuardian(GUARDIAN_A),
		/Guardian not found/,
		'deleting a missing guardian should throw'
	);
});
