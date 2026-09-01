import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { Pool, type PoolClient } from "pg";

import { deriveWaterTemperatureState } from "@/lib/water-temperature";

const TEST_DATABASE_URL = process.env.WATER_TEMPERATURE_TEST_DATABASE_URL;
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const SHIFT_ID = "22222222-2222-4222-8222-222222222222";

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

      await assertLegacyShiftUntouched(client, legacyShiftBefore);
      await assertConfigBackfill(client);
      await exerciseShiftIdentityConstraints(client);
      await exerciseActiveUniqueness(client);
      await exerciseInputValidityConstraints(client);
      await exercisePreservationAcrossResolution(client);
      await exerciseSupersedeAndRevisionRetention(client);
      await exerciseReferentialIntegrity(client);
      await exerciseAggregateRollback(client);
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
  await expectPgError(
    baseInsert({ state: "action_required" }), // no action text supplied
    "23514",
  );

  // None of the rejected attempts above left rows behind, so 108F (below) and
  // 118F (above) can still be inserted as valid, storable inputs.
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
		) VALUES ($1, 'House One', '2026-04-02', 2, 1180, 1130, 'staff-9', 'Staff Nine', 'S9', now(), 'action_required', 'Restricted resident access; notified maintenance', 'staff-9')
		RETURNING "id"`,
    [LOCATION_ID],
  );
  assert.ok(aboveRow.rows[0].id, "118F above-range reading is a valid, storable observation");

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
		) VALUES ($1, 'House One', '2026-05-01', 1, 1180, 1130, 'staff-1', 'Jordan Ellis', 'JE', now(), 'recheck_required', 'Restricted use; will recheck', 'staff-1')
		RETURNING "id"`,
    [LOCATION_ID],
  );
  const checkId = check.rows[0].id as string;

  await client.query(
    `INSERT INTO "water_temperature_rechecks" (
			"check_id", "fixture", "temp_tenths", "staff_id", "staff_name_snapshot",
			"staff_initials_snapshot", "measured_at", "sequence", "created_by"
		) VALUES ($1, 'kitchen', 1160, 'staff-1', 'Jordan Ellis', 'JE', now(), 1, 'staff-1')`,
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
    1180,
    "the original 118.0F kitchen observation is preserved after one unsafe and one safe recheck",
  );
  assert.equal(header.rows[0].state, "complete");

  const rechecks = await client.query(
    `SELECT "temp_tenths", "sequence" FROM "water_temperature_rechecks" WHERE "check_id" = $1 ORDER BY "sequence"`,
    [checkId],
  );
  assert.deepEqual(rechecks.rows, [
    { temp_tenths: 1160, sequence: 1 },
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
		) VALUES ($1, 'House One', '2026-05-02', 1, 1180, 1130, 'staff-1', 'Jordan Ellis', 'JE', now(), 'recheck_required', 'Restricted use; will recheck', 'staff-1')
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
    kitchenTempTenths: 1180,
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
