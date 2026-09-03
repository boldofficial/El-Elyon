import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { Pool, type PoolClient } from "pg";

import { deriveWaterTemperatureState } from "@/lib/water-temperature";
// Type-only: erased entirely at compile time, so this does not trigger
// db/mutations/water-temperature.ts's runtime module evaluation (and thus
// not @/db/index's validateEnvironment() either) ahead of
// setWaterTemperatureIntegrationTestEnv() below.
import type { WaterTemperatureExecutor } from "@/db/mutations/water-temperature";

// U3's mutation module (db/mutations/water-temperature.ts) transitively
// imports @/db/index, which calls validateEnvironment() at module load
// time. Static ES module imports are hoisted ahead of any same-file
// executable statement, so a fake-env-var call placed *after* a static
// import of that module here would run too late to matter. Instead, the
// mutation/query modules and drizzle-orm/node-postgres are imported
// dynamically, only from inside the skip-gated test callback below (after
// setWaterTemperatureIntegrationTestEnv() has already run as this file's
// first top-level statement) -- so a plain `npm run test:water-temperature:db`
// invocation with no WATER_TEMPERATURE_TEST_DATABASE_URL set never touches
// @/db/index at all, exactly like the rest of this file's existing
// raw-`pg`-only exercises.
setWaterTemperatureIntegrationTestEnv();

const TEST_DATABASE_URL = process.env.WATER_TEMPERATURE_TEST_DATABASE_URL;
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const SHIFT_ID = "22222222-2222-4222-8222-222222222222";

// These are the ONLY executable proofs that this feature's multi-table writes
// are atomic. `drizzle-orm/neon-http` cannot run `db.transaction()` at all, so
// every such write is a single-statement CTE or a compare-and-swap -- claims
// that code review cannot verify and only a real PostgreSQL round-trip can.
//
// Skipping is therefore a *gap*, not a pass. Locally that is tolerable; in CI
// it would let a green build certify guarantees nothing ever checked. Set
// WATER_TEMPERATURE_DB_REQUIRED=1 (or CI=true) to turn a missing test database
// into a hard failure instead of a silent skip.
const DB_PROOFS_REQUIRED =
  process.env.WATER_TEMPERATURE_DB_REQUIRED === "1" ||
  process.env.CI === "true";

if (!TEST_DATABASE_URL && DB_PROOFS_REQUIRED) {
  throw new Error(
    "WATER_TEMPERATURE_TEST_DATABASE_URL is required when " +
      "WATER_TEMPERATURE_DB_REQUIRED=1 or CI=true. The water-temperature " +
      "atomicity/concurrency proofs cannot be skipped in this context -- " +
      "point it at an isolated PostgreSQL database."
  );
}

const skipReason = TEST_DATABASE_URL
  ? false
  : "Set WATER_TEMPERATURE_TEST_DATABASE_URL to an isolated PostgreSQL database";

test(
  "daily water-temperature migration is additive and enforces aggregate constraints",
  { skip: skipReason },
  async () => {
    assert.ok(TEST_DATABASE_URL);
    assert.notEqual(
      normalizeConnectionString(TEST_DATABASE_URL),
      normalizeConnectionString(PRODUCTION_DATABASE_URL),
      "WATER_TEMPERATURE_TEST_DATABASE_URL must not equal DATABASE_URL",
    );

    const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    const schemaName = `water_temperature_${crypto.randomUUID().replaceAll("-", "")}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}", public`);
      await createPrerequisites(client);
      await seedLegacyFixtures(client);

      const legacyShiftBefore = await legacyShiftFingerprint(client);
      const migration = await readFile(
        path.join(
          process.cwd(),
          "drizzle",
          "0011_add_daily_water_temperature_checks.sql",
        ),
        "utf8",
      );
      await client.query(migration);
      // U3 fix: 0011's action_required_check incorrectly required non-blank
      // `action` text for the `action_required` state itself (the state a
      // fresh above-range observation lands in *before* any action is
      // documented), blocking the feature's core workflow. See
      // drizzle/0012_fix_water_temperature_action_required_check.sql.
      const constraintFix = await readFile(
        path.join(
          process.cwd(),
          "drizzle",
          "0012_fix_water_temperature_action_required_check.sql",
        ),
        "utf8",
      );
      await client.query(constraintFix);

      await assertLegacyShiftUntouched(client, legacyShiftBefore);
      await assertConfigBackfill(client);
      await exerciseShiftIdentityConstraints(client);
      await exerciseActiveUniqueness(client);
      await exerciseInputValidityConstraints(client);
      await exercisePreservationAcrossResolution(client);
      await exerciseSupersedeAndRevisionRetention(client);
      await exerciseReferentialIntegrity(client);
      await exerciseAggregateRollback(client);
      await exerciseConcurrentCreatesViaMutationLayer(client, schemaName);
      await exerciseRecheckRacesVoidViaMutationLayer(client, schemaName);
    } finally {
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);

async function createPrerequisites(client: PoolClient): Promise<void> {
  // Pre-migration shapes for tables the migration ALTERs, so the migration's
  // additive behavior is genuinely exercised rather than assumed.
  await client.query(`
		CREATE TABLE "locations" (
			"id" uuid PRIMARY KEY,
			"name" varchar(255) NOT NULL,
			"status" varchar(50) NOT NULL DEFAULT 'active'
		);
		CREATE TABLE "shifts" (
			"id" uuid PRIMARY KEY,
			"clerk_user_id" varchar(255) NOT NULL,
			"location" varchar(255) NOT NULL,
			"clock_in_time" timestamp NOT NULL,
			"clock_out_time" timestamp
		);
		CREATE TABLE "config" (
			"id" uuid PRIMARY KEY,
			"selfie_enforced" boolean
		);
	`);
}

async function seedLegacyFixtures(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO "locations" ("id", "name") VALUES ($1, 'House One')`,
    [LOCATION_ID],
  );
  await client.query(
    `INSERT INTO "shifts" ("id", "clerk_user_id", "location", "clock_in_time")
     VALUES ('33333333-3333-4333-8333-333333333333', 'legacy-user', 'House One', '2025-01-01 09:00:00')`,
  );
  await client.query(
    `INSERT INTO "config" ("id", "selfie_enforced") VALUES ('44444444-4444-4444-8444-444444444444', true)`,
  );
}

async function legacyShiftFingerprint(client: PoolClient): Promise<unknown> {
  const result = await client.query(
    `SELECT "id", "clerk_user_id", "location", "clock_in_time" FROM "shifts" ORDER BY "id"`,
  );
  return result.rows;
}

async function assertLegacyShiftUntouched(
  client: PoolClient,
  before: unknown,
): Promise<void> {
  const after = await client.query(
    `SELECT "id", "clerk_user_id", "location", "clock_in_time" FROM "shifts" ORDER BY "id"`,
  );
  assert.deepEqual(after.rows, before);

  const identity = await client.query(
    `SELECT "location_id", "shift_slot", "operational_date", "operational_time_zone_snapshot"
     FROM "shifts" WHERE "id" = '33333333-3333-4333-8333-333333333333'`,
  );
  assert.deepEqual(identity.rows[0], {
    location_id: null,
    shift_slot: null,
    operational_date: null,
    operational_time_zone_snapshot: null,
  });
}

async function assertConfigBackfill(client: PoolClient): Promise<void> {
  const result = await client.query(
    `SELECT "operational_time_zone" FROM "config" WHERE "id" = '44444444-4444-4444-8444-444444444444'`,
  );
  assert.equal(result.rows[0]?.operational_time_zone, "America/Chicago");
}

async function exerciseShiftIdentityConstraints(
  client: PoolClient,
): Promise<void> {
  await expectPgError(
    client.query(
      `INSERT INTO "shifts" ("id", "clerk_user_id", "location", "clock_in_time", "location_id")
       VALUES ('55555555-5555-4555-8555-555555555555', 'partial-user', 'House One', now(), $1)`,
      [LOCATION_ID],
    ),
    "23514",
  );
  await expectPgError(
    client.query(
      `INSERT INTO "shifts" (
				"id", "clerk_user_id", "location", "clock_in_time",
				"location_id", "shift_slot", "operational_date", "operational_time_zone_snapshot"
			) VALUES (
				'66666666-6666-4666-8666-666666666666', 'bad-slot-user', 'House One', now(),
				$1, 5, '2026-03-04', 'America/Chicago'
			)`,
      [LOCATION_ID],
    ),
    "23514",
  );

  await client.query(
    `INSERT INTO "shifts" (
			"id", "clerk_user_id", "location", "clock_in_time",
			"location_id", "shift_slot", "operational_date", "operational_time_zone_snapshot"
		) VALUES (
			$1, 'current-user', 'House One', '2026-03-04 08:00:00',
			$2, 2, '2026-03-04', 'America/Chicago'
		)`,
    [SHIFT_ID, LOCATION_ID],
  );
}

async function exerciseActiveUniqueness(client: PoolClient): Promise<void> {
  const insertCheck = (shiftSlot: number, kitchenTenths = 1120) =>
    client.query(
      `INSERT INTO "water_temperature_checks" (
				"location_id", "house_name_snapshot", "operational_date", "shift_slot", "shift_id",
				"kitchen_temp_tenths", "bath_temp_tenths", "staff_id", "staff_name_snapshot",
				"staff_initials_snapshot", "observed_at", "state", "created_by"
			) VALUES (
				$1, 'House One', '2026-03-04', $2, $3,
				$4, 1140, 'staff-1', 'Jordan Ellis', 'JE', now(), 'complete', 'staff-1'
			) RETURNING "id"`,
      [LOCATION_ID, shiftSlot, SHIFT_ID, kitchenTenths],
    );

  const first = await insertCheck(1);
  await insertCheck(2);
  await insertCheck(3);

  // A fourth active record duplicating an already-used slot must be rejected.
  await expectPgError(insertCheck(2), "23505");

  // Voiding the slot-1 record reopens the identity for a replacement.
  await client.query(
    `UPDATE "water_temperature_checks"
		 SET "voided_at" = now(), "voided_by" = 'supervisor-1', "void_reason" = 'Entered under wrong house', "version" = 2
		 WHERE "id" = $1`,
    [first.rows[0].id],
  );
  const replacement = await insertCheck(1, 1110);

  const historyCount = await client.query(
    `SELECT count(*)::integer AS count FROM "water_temperature_checks" WHERE "shift_slot" = 1`,
  );
  assert.equal(historyCount.rows[0].count, 2, "voided row is retained, not deleted");

  await client.query(
    `INSERT INTO "water_temperature_check_revisions" (
			"check_id", "version", "action", "before_snapshot", "after_snapshot", "actor_id"
		) VALUES ($1, 1, 'create', NULL, $2::jsonb, 'staff-1')`,
    [replacement.rows[0].id, JSON.stringify({ id: replacement.rows[0].id, state: "complete" })],
  );
}

async function exerciseInputValidityConstraints(
  client: PoolClient,
): Promise<void> {
  const baseInsert = (overrides: Record<string, string | number>) => {
    const values: Record<string, string | number> = {
      location_id: LOCATION_ID,
      house_name_snapshot: "House One",
      operational_date: "2026-04-01",
      shift_slot: 1,
      kitchen_temp_tenths: 1120,
      bath_temp_tenths: 1140,
      staff_id: "staff-9",
      staff_name_snapshot: "Staff Nine",
      staff_initials_snapshot: "S9",
      state: "complete",
      created_by: "staff-9",
      ...overrides,
    };
    return client.query(
      `INSERT INTO "water_temperature_checks" (
				"location_id", "house_name_snapshot", "operational_date", "shift_slot",
				"kitchen_temp_tenths", "bath_temp_tenths", "staff_id", "staff_name_snapshot",
				"staff_initials_snapshot", "observed_at", "state", "created_by"
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now(), $10, $11)`,
      [
        values.location_id,
        values.house_name_snapshot,
        values.operational_date,
        values.shift_slot,
        values.kitchen_temp_tenths,
        values.bath_temp_tenths,
        values.staff_id,
        values.staff_name_snapshot,
        values.staff_initials_snapshot,
        values.state,
        values.created_by,
      ],
    );
  };

  await expectPgError(baseInsert({ shift_slot: 4 }), "23514");
  await expectPgError(baseInsert({ kitchen_temp_tenths: -5 }), "23514");
  await expectPgError(baseInsert({ kitchen_temp_tenths: 5000 }), "23514");
  await expectPgError(baseInsert({ staff_name_snapshot: "   " }), "23514");
  await expectPgError(baseInsert({ house_name_snapshot: "" }), "23514");
  // recheck_required still requires non-blank action text (it is only
  // reachable after the 'action' mutation has already set one).
  await expectPgError(
    baseInsert({ state: "recheck_required" }), // no action text supplied
    "23514",
  );
  // action_required is the state a fresh above-range observation lands in
  // *before* any action is documented -- per the 0012 fix, it must NOT
  // require action text (this was 0011's defect; see the migration
  // application above).
  await baseInsert({ state: "action_required" }); // no action text supplied; must succeed

  // None of the rejected attempts above left rows behind, so 108F (below) and
  // 125F (above) can still be inserted as valid, storable inputs.
  await client.query(
    `INSERT INTO "water_temperature_checks" (
			"location_id", "house_name_snapshot", "operational_date", "shift_slot",
			"kitchen_temp_tenths", "bath_temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "observed_at", "state", "created_by"
		) VALUES ($1, 'House One', '2026-04-02', 1, 1080, 1120, 'staff-9', 'Staff Nine', 'S9', now(), 'complete_with_attention', 'staff-9')`,
    [LOCATION_ID],
  );
  const aboveRow = await client.query(
    `INSERT INTO "water_temperature_checks" (
			"location_id", "house_name_snapshot", "operational_date", "shift_slot",
			"kitchen_temp_tenths", "bath_temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "observed_at", "state", "action", "created_by"
		) VALUES ($1, 'House One', '2026-04-02', 2, 1250, 1130, 'staff-9', 'Staff Nine', 'S9', now(), 'action_required', 'Restricted resident access; notified maintenance', 'staff-9')
		RETURNING "id"`,
    [LOCATION_ID],
  );
  assert.ok(aboveRow.rows[0].id, "125F above-range reading is a valid, storable observation");

  // Malformed void metadata.
  await expectPgError(
    client.query(
      `UPDATE "water_temperature_checks" SET "voided_at" = now() WHERE "id" = $1`,
      [aboveRow.rows[0].id],
    ),
    "23514",
  );
  await expectPgError(
    client.query(
      `UPDATE "water_temperature_checks"
			 SET "voided_at" = now(), "voided_by" = 'supervisor-1', "void_reason" = ''
			 WHERE "id" = $1`,
      [aboveRow.rows[0].id],
    ),
    "23514",
  );
}

async function exercisePreservationAcrossResolution(
  client: PoolClient,
): Promise<void> {
  const check = await client.query(
    `INSERT INTO "water_temperature_checks" (
			"location_id", "house_name_snapshot", "operational_date", "shift_slot",
			"kitchen_temp_tenths", "bath_temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "observed_at", "state", "action", "created_by"
		) VALUES ($1, 'House One', '2026-05-01', 1, 1250, 1130, 'staff-1', 'Jordan Ellis', 'JE', now(), 'recheck_required', 'Restricted use; will recheck', 'staff-1')
		RETURNING "id"`,
    [LOCATION_ID],
  );
  const checkId = check.rows[0].id as string;

  await client.query(
    `INSERT INTO "water_temperature_rechecks" (
			"check_id", "fixture", "temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "measured_at", "sequence", "created_by"
		) VALUES ($1, 'kitchen', 1230, 'staff-1', 'Jordan Ellis', 'JE', now(), 1, 'staff-1')`,
    [checkId],
  );
  await client.query(
    `INSERT INTO "water_temperature_rechecks" (
			"check_id", "fixture", "temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "measured_at", "sequence", "created_by"
		) VALUES ($1, 'kitchen', 1140, 'staff-1', 'Jordan Ellis', 'JE', now(), 2, 'staff-1')`,
    [checkId],
  );
  await client.query(
    `UPDATE "water_temperature_checks" SET "state" = 'complete', "version" = 2 WHERE "id" = $1`,
    [checkId],
  );

  const header = await client.query(
    `SELECT "kitchen_temp_tenths", "bath_temp_tenths", "state" FROM "water_temperature_checks" WHERE "id" = $1`,
    [checkId],
  );
  assert.equal(
    header.rows[0].kitchen_temp_tenths,
    1250,
    "the original 125.0F kitchen observation is preserved after one unsafe and one safe recheck",
  );
  assert.equal(header.rows[0].state, "complete");

  const rechecks = await client.query(
    `SELECT "temp_tenths", "sequence" FROM "water_temperature_rechecks" WHERE "check_id" = $1 ORDER BY "sequence"`,
    [checkId],
  );
  assert.deepEqual(rechecks.rows, [
    { temp_tenths: 1230, sequence: 1 },
    { temp_tenths: 1140, sequence: 2 },
  ]);

  // Cross-check against the pure state-derivation function using the exact
  // facts now stored in the database.
  const derived = deriveWaterTemperatureState({
    kitchenTempTenths: header.rows[0].kitchen_temp_tenths,
    bathTempTenths: header.rows[0].bath_temp_tenths,
    hasAction: true,
    rechecks: rechecks.rows.map((row) => ({
      fixture: "kitchen" as const,
      tempTenths: row.temp_tenths,
      sequence: row.sequence,
    })),
  });
  assert.equal(derived, "complete");
}

async function exerciseSupersedeAndRevisionRetention(
  client: PoolClient,
): Promise<void> {
  const check = await client.query(
    `INSERT INTO "water_temperature_checks" (
			"location_id", "house_name_snapshot", "operational_date", "shift_slot",
			"kitchen_temp_tenths", "bath_temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "observed_at", "state", "action", "created_by"
		) VALUES ($1, 'House One', '2026-05-02', 1, 1250, 1130, 'staff-1', 'Jordan Ellis', 'JE', now(), 'recheck_required', 'Restricted use; will recheck', 'staff-1')
		RETURNING "id"`,
    [LOCATION_ID],
  );
  const checkId = check.rows[0].id as string;

  const mistyped = await client.query(
    `INSERT INTO "water_temperature_rechecks" (
			"check_id", "fixture", "temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "measured_at", "sequence", "created_by"
		) VALUES ($1, 'kitchen', 1300, 'staff-1', 'Jordan Ellis', 'JE', now(), 1, 'staff-1')
		RETURNING "id"`,
    [checkId],
  );
  await client.query(
    `INSERT INTO "water_temperature_rechecks" (
			"check_id", "fixture", "temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "measured_at", "sequence", "created_by"
		) VALUES ($1, 'kitchen', 1140, 'staff-1', 'Jordan Ellis', 'JE', now(), 2, 'staff-1')`,
    [checkId],
  );

  // Malformed supersede metadata: a timestamp without an actor/reason.
  await expectPgError(
    client.query(
      `UPDATE "water_temperature_rechecks" SET "superseded_at" = now() WHERE "id" = $1`,
      [mistyped.rows[0].id],
    ),
    "23514",
  );

  await client.query(
    `UPDATE "water_temperature_rechecks"
		 SET "superseded_at" = now(), "superseded_by" = 'staff-1', "superseded_reason" = 'Fat-fingered reading; corrected below'
		 WHERE "id" = $1`,
    [mistyped.rows[0].id],
  );

  const rechecks = await client.query(
    `SELECT "temp_tenths", "sequence", "superseded_at" IS NOT NULL AS superseded
		 FROM "water_temperature_rechecks" WHERE "check_id" = $1 ORDER BY "sequence"`,
    [checkId],
  );
  assert.deepEqual(rechecks.rows, [
    { temp_tenths: 1300, sequence: 1, superseded: true },
    { temp_tenths: 1140, sequence: 2, superseded: false },
  ]);

  const derived = deriveWaterTemperatureState({
    kitchenTempTenths: 1250,
    bathTempTenths: 1130,
    hasAction: true,
    rechecks: [
      { fixture: "kitchen", tempTenths: 1300, sequence: 1, supersededAt: new Date() },
      { fixture: "kitchen", tempTenths: 1140, sequence: 2, supersededAt: null },
    ],
  });
  assert.equal(derived, "complete");
}

async function exerciseReferentialIntegrity(client: PoolClient): Promise<void> {
  const check = await client.query(
    `INSERT INTO "water_temperature_checks" (
			"location_id", "house_name_snapshot", "operational_date", "shift_slot", "shift_id",
			"kitchen_temp_tenths", "bath_temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "observed_at", "state", "created_by"
		) VALUES ($1, 'House One', '2026-05-03', 3, $2, 1120, 1140, 'staff-1', 'Jordan Ellis', 'JE', now(), 'complete', 'staff-1')
		RETURNING "id"`,
    [LOCATION_ID, SHIFT_ID],
  );
  const checkId = check.rows[0].id as string;

  // Removing the originating shift does not erase the compliance record.
  await client.query(`DELETE FROM "shifts" WHERE "id" = $1`, [SHIFT_ID]);
  const afterShiftDelete = await client.query(
    `SELECT "shift_id" FROM "water_temperature_checks" WHERE "id" = $1`,
    [checkId],
  );
  assert.equal(afterShiftDelete.rows[0].shift_id, null);

  // Renaming the house preserves the historical snapshot.
  await client.query(`UPDATE "locations" SET "name" = 'House One Renamed' WHERE "id" = $1`, [
    LOCATION_ID,
  ]);
  const snapshotAfterRename = await client.query(
    `SELECT "house_name_snapshot" FROM "water_temperature_checks" WHERE "id" = $1`,
    [checkId],
  );
  assert.equal(snapshotAfterRename.rows[0].house_name_snapshot, "House One");

  // A location with active compliance history cannot be hard-deleted.
  await expectPgError(
    client.query(`DELETE FROM "locations" WHERE "id" = $1`, [LOCATION_ID]),
    "23503",
  );
}

async function exerciseAggregateRollback(client: PoolClient): Promise<void> {
  await client.query("BEGIN");
  try {
    const check = await client.query(
      `INSERT INTO "water_temperature_checks" (
				"location_id", "house_name_snapshot", "operational_date", "shift_slot",
				"kitchen_temp_tenths", "bath_temp_tenths", "staff_id", "staff_name_snapshot",
				"staff_initials_snapshot", "observed_at", "state", "created_by"
			) VALUES ($1, 'House One', '2026-06-01', 1, 1120, 1140, 'staff-1', 'Jordan Ellis', 'JE', now(), 'complete', 'staff-1')
			RETURNING "id"`,
      [LOCATION_ID],
    );
    // The revision write fails because after_snapshot is not a JSON object.
    await client.query(
      `INSERT INTO "water_temperature_check_revisions" (
				"check_id", "version", "action", "after_snapshot", "actor_id"
			) VALUES ($1, 1, 'create', $2::jsonb, 'staff-1')`,
      [check.rows[0].id, JSON.stringify("not-an-object")],
    );
    assert.fail("Expected the revision snapshot constraint to abort the transaction");
  } catch (error) {
    assert.equal(pgCode(error), "23514");
    await client.query("ROLLBACK");
  }

  const rolledBackCount = await client.query(
    `SELECT count(*)::integer AS count FROM "water_temperature_checks" WHERE "operational_date" = '2026-06-01'`,
  );
  assert.equal(
    rolledBackCount.rows[0].count,
    0,
    "the check insert is rolled back with its failed revision write",
  );
}

async function expectPgError(
  promise: Promise<unknown>,
  code: string,
): Promise<void> {
  await assert.rejects(promise, (error: unknown) => pgCode(error) === code);
}

function pgCode(error: unknown): string | undefined {
  return typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : undefined;
}

function normalizeConnectionString(
  value: string | undefined,
): string | undefined {
  if (!value) return undefined;
  const url = new URL(value);
  url.searchParams.sort();
  return url.toString();
}

// ============================================================================
// U3 CONCURRENCY/ATOMICITY PROOFS
//
// These two exercises run the *actual* production mutation code from
// db/mutations/water-temperature.ts (createWaterTemperatureCheckAggregate /
// appendWaterTemperatureRecheckAggregate / voidWaterTemperatureCheckAggregate)
// against this same dockerized Postgres, through a real
// drizzle-orm/node-postgres instance -- not hand-copied SQL. This is the
// only way to exercise that code against a live Postgres server: the
// production `db` singleton (drizzle-orm/neon-http) speaks Neon's HTTP wire
// protocol and cannot be repointed at a plain/dockerized Postgres, so every
// mutation function in that module accepts a `WaterTemperatureExecutor`
// (defaulting to the production `db`) specifically so a test can substitute
// a differently-driven-but-otherwise-identical executor here.
// ============================================================================

async function buildMutationTestExecutor(
  schemaName: string,
): Promise<{ executor: WaterTemperatureExecutor; close: () => Promise<void> }> {
  const { drizzle } = await import("drizzle-orm/node-postgres");
  // A dedicated pool (distinct from the outer `client`'s single connection)
  // with more than one connection, so two calls issued "concurrently" from
  // this test can genuinely have two statements in flight against Postgres
  // at once, rather than being serialized through one connection.
  //
  // search_path is set via the connection's `options` startup parameter
  // (libpq's `-c name=value`), not a post-connect `SET` query: the startup
  // parameter is applied before the connection can run any query at all, so
  // there is no race window where a freshly-created pool connection (e.g.
  // one opened late, for a conflict-resolution read) could run a real query
  // against the wrong schema or still be mid-`SET` when the pool is closed.
  const pool = new Pool({
    connectionString: TEST_DATABASE_URL,
    options: `-c search_path="${schemaName}",public`,
    max: 4,
  });
  const executor = drizzle(pool) as unknown as WaterTemperatureExecutor;
  return { executor, close: () => pool.end() };
}

async function exerciseConcurrentCreatesViaMutationLayer(
  client: PoolClient,
  schemaName: string,
): Promise<void> {
  const { createWaterTemperatureCheckAggregate } = await import(
    "@/db/mutations/water-temperature"
  );
  const { WaterTemperatureConflictError } = await import(
    "@/db/queries/water-temperature"
  );
  const { executor, close } = await buildMutationTestExecutor(schemaName);

  try {
    const baseArgs = {
      locationId: LOCATION_ID,
      houseName: "House One",
      operationalDate: "2026-07-01",
      shiftSlot: 1 as const,
      shiftId: null,
      kitchenTempTenths: 1120,
      bathTempTenths: 1140,
      observedAt: new Date("2026-07-01T08:00:00Z"),
      comments: null,
      reason: null,
    };

    const [outcomeA, outcomeB] = await Promise.allSettled([
      createWaterTemperatureCheckAggregate(executor, {
        ...baseArgs,
        staffId: "staff-race-1",
        staffName: "Race Worker One",
        staffInitials: "R1",
        actorId: "staff-race-1",
        actorName: "Race Worker One",
        idempotencyKey: "race-create-a",
      }),
      createWaterTemperatureCheckAggregate(executor, {
        ...baseArgs,
        staffId: "staff-race-2",
        staffName: "Race Worker Two",
        staffInitials: "R2",
        actorId: "staff-race-2",
        actorName: "Race Worker Two",
        idempotencyKey: "race-create-b",
      }),
    ]);

    const outcomes = [outcomeA, outcomeB];
    const fulfilledCount = outcomes.filter((o) => o.status === "fulfilled").length;
    const rejections = outcomes.flatMap((o) => (o.status === "rejected" ? [o.reason] : []));
    assert.equal(fulfilledCount, 1, "exactly one concurrent create should win");
    assert.equal(
      rejections.length,
      1,
      "the loser must receive a typed conflict, not silently overwrite the winner",
    );
    assert.ok(rejections[0] instanceof WaterTemperatureConflictError);
    const conflict = rejections[0] as InstanceType<typeof WaterTemperatureConflictError>;
    assert.equal(conflict.code, "UNIQUE_CONFLICT");
    assert.ok(conflict.current, "the loser can reload the winning record to recover");

    const activeRows = await client.query(
      `SELECT count(*)::integer AS count FROM "water_temperature_checks"
       WHERE "location_id" = $1 AND "operational_date" = $2 AND "shift_slot" = $3 AND "voided_at" IS NULL`,
      [LOCATION_ID, "2026-07-01", 1],
    );
    assert.equal(
      activeRows.rows[0].count,
      1,
      "exactly one active row exists for this house/date/slot after the race",
    );
  } finally {
    await close();
  }
}

async function exerciseRecheckRacesVoidViaMutationLayer(
  client: PoolClient,
  schemaName: string,
): Promise<void> {
  const { appendWaterTemperatureRecheckAggregate, voidWaterTemperatureCheckAggregate } =
    await import("@/db/mutations/water-temperature");
  const { WaterTemperatureConflictError, WaterTemperatureNotFoundError } = await import(
    "@/db/queries/water-temperature"
  );
  const { executor, close } = await buildMutationTestExecutor(schemaName);

  try {
    const inserted = await client.query(
      `INSERT INTO "water_temperature_checks" (
         "location_id", "house_name_snapshot", "operational_date", "shift_slot",
         "kitchen_temp_tenths", "bath_temp_tenths", "staff_id", "staff_name_snapshot",
         "staff_initials_snapshot", "observed_at", "state", "action", "created_by"
       ) VALUES (
         $1, 'House One', '2026-07-02', 1, 1250, 1130, 'staff-1', 'Jordan Ellis', 'JE',
         now(), 'recheck_required', 'Restricted use; will recheck', 'staff-1'
       ) RETURNING "id"`,
      [LOCATION_ID],
    );
    const checkId = inserted.rows[0].id as string;

    const [recheckOutcome, voidOutcome] = await Promise.allSettled([
      appendWaterTemperatureRecheckAggregate(executor, {
        checkId,
        locationId: LOCATION_ID,
        operationalDate: "2026-07-02",
        shiftSlot: 1,
        expectedVersion: 1,
        fixture: "kitchen",
        tempTenths: 1140,
        staffId: "staff-2",
        staffName: "Replacement Worker",
        staffInitials: "RW",
        measuredAt: new Date("2026-07-02T10:00:00Z"),
        actorId: "staff-2",
        actorName: "Replacement Worker",
        idempotencyKey: "race-recheck",
      }),
      voidWaterTemperatureCheckAggregate(executor, {
        checkId,
        locationId: LOCATION_ID,
        expectedVersion: 1,
        reason: "Entered under wrong house",
        actorId: "supervisor-1",
        actorName: "Supervisor One",
        idempotencyKey: "race-void",
      }),
    ]);

    const oneWon =
      (recheckOutcome.status === "fulfilled" && voidOutcome.status === "rejected") ||
      (recheckOutcome.status === "rejected" && voidOutcome.status === "fulfilled");
    assert.ok(
      oneWon,
      "exactly one of the racing recheck-append/void attempts should win the header's compare-and-swap",
    );

    if (voidOutcome.status === "rejected") {
      assert.ok(
        voidOutcome.reason instanceof WaterTemperatureConflictError ||
          voidOutcome.reason instanceof WaterTemperatureNotFoundError,
      );
    }
    if (recheckOutcome.status === "rejected") {
      assert.ok(
        recheckOutcome.reason instanceof WaterTemperatureConflictError ||
          recheckOutcome.reason instanceof WaterTemperatureNotFoundError,
      );
    }

    const finalRow = await client.query(
      `SELECT "voided_at", "version" FROM "water_temperature_checks" WHERE "id" = $1`,
      [checkId],
    );
    const recheckCount = await client.query(
      `SELECT count(*)::integer AS count FROM "water_temperature_rechecks" WHERE "check_id" = $1`,
      [checkId],
    );

    assert.equal(finalRow.rows[0].version, 2, "exactly one write advanced the header version");

    if (finalRow.rows[0].voided_at !== null) {
      // The void won the race: the stale recheck attempt must not have
      // appended to the now-superseded (voided) aggregate.
      assert.equal(
        recheckCount.rows[0].count,
        0,
        "a stale recheck racing a void must not append to the voided aggregate",
      );
      assert.equal(recheckOutcome.status, "rejected");
    } else {
      // The recheck won the race: the void attempt must not have voided the
      // check out from under the just-appended recheck.
      assert.equal(recheckCount.rows[0].count, 1);
      assert.equal(voidOutcome.status, "rejected");
    }
  } finally {
    await close();
  }
}

function setWaterTemperatureIntegrationTestEnv(): void {
  const env: Record<string, string> = {
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    AWS_REGION: "us-east-1",
    AWS_ENDPOINT_URL: "http://localhost:9000",
    AWS_ACCESS_KEY_ID: "test",
    AWS_SECRET_ACCESS_KEY: "test",
    AWS_S3_BUCKET_NAME: "test-bucket",
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test",
    CLERK_SECRET_KEY: "sk_test",
  };
  for (const [key, value] of Object.entries(env)) {
    if (!process.env[key]) process.env[key] = value;
  }
}
