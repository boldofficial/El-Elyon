import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { Pool, type PoolClient } from "pg";

import { MAX_FIRE_DRILL_DURATION_MINUTES } from "@/lib/life-safety-reporting";
import { selectFireDrillResidentNameSnapshot } from "@/lib/life-safety-reporting";

const TEST_DATABASE_URL = process.env.LIFE_SAFETY_TEST_DATABASE_URL;
const PRODUCTION_DATABASE_URL = process.env.DATABASE_URL;
const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const RESIDENT_ID = "22222222-2222-4222-8222-222222222222";
const RESIDENT_TWO_ID = "33333333-3333-4333-8333-333333333333";

const skipReason = TEST_DATABASE_URL
  ? false
  : "Set LIFE_SAFETY_TEST_DATABASE_URL to an isolated PostgreSQL database";

test(
  "life-safety v2 migration preserves legacy rows and enforces aggregate constraints",
  { skip: skipReason },
  async () => {
    assert.ok(TEST_DATABASE_URL);
    assert.notEqual(
      normalizeConnectionString(TEST_DATABASE_URL),
      normalizeConnectionString(PRODUCTION_DATABASE_URL),
      "LIFE_SAFETY_TEST_DATABASE_URL must not equal DATABASE_URL",
    );

    const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
    const client = await pool.connect();
    const schemaName = `life_safety_${crypto.randomUUID().replaceAll("-", "")}`;

    try {
      await client.query(`CREATE SCHEMA "${schemaName}"`);
      await client.query(`SET search_path TO "${schemaName}", public`);
      await createPrerequisites(client);
      await seedLegacyFixtures(client);

      const legacyBefore = await legacyFingerprint(client);
      const migration = await readFile(
        path.join(
          process.cwd(),
          "drizzle",
          "0010_add_life_safety_reporting_v2.sql",
        ),
        "utf8",
      );
      await client.query(migration);
      assert.deepEqual(await legacyFingerprint(client), legacyBefore);

      await exerciseInspectionConstraints(client);
      await exerciseFireDrillConstraints(client);
    } finally {
      await client.query("RESET search_path").catch(() => undefined);
      await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      client.release();
      await pool.end();
    }
  },
);

test("fire-drill corrections preserve old snapshots for existing residents", () => {
  const participant = {
    participantSource: "roster" as const,
    residentId: RESIDENT_ID,
    residentNameSnapshot: "Current edit placeholder",
  };
  const preserved = selectFireDrillResidentNameSnapshot({
    participant,
    snapshotByResidentId: new Map([[RESIDENT_ID, "Resident One"]]),
    rosterById: new Map([[RESIDENT_ID, "Resident Renamed"]]),
  });
  const fresh = selectFireDrillResidentNameSnapshot({
    participant: {...participant, residentId: RESIDENT_TWO_ID},
    snapshotByResidentId: new Map([[RESIDENT_ID, "Resident One"]]),
    rosterById: new Map([[RESIDENT_TWO_ID, "Resident Two"]]),
  });

  assert.equal(preserved, "Resident One");
  assert.equal(fresh, "Resident Two");
});

async function createPrerequisites(client: PoolClient): Promise<void> {
  await client.query(`
		CREATE TABLE "locations" (
			"id" uuid PRIMARY KEY,
			"name" varchar(255) NOT NULL
		);
		CREATE TABLE "residents" (
			"id" uuid PRIMARY KEY,
			"name" varchar(255) NOT NULL,
			"location" varchar(255) NOT NULL
		);
		CREATE TABLE "smoke_detector_checks" (
			"id" uuid PRIMARY KEY,
			"location" varchar(255) NOT NULL,
			"smoke_status" varchar(50) NOT NULL,
			"co_status" varchar(50) NOT NULL,
			"notes" text
		);
		CREATE TABLE "fire_drills" (
			"id" uuid PRIMARY KEY,
			"location" varchar(255) NOT NULL,
			"year" integer NOT NULL,
			"sequence" integer NOT NULL,
			"resident_name" varchar(255) NOT NULL,
			"comment" text
		);
	`);
}

async function seedLegacyFixtures(client: PoolClient): Promise<void> {
  await client.query(
    `INSERT INTO "locations" ("id", "name") VALUES ($1, 'House One')`,
    [LOCATION_ID],
  );
  await client.query(
    `INSERT INTO "residents" ("id", "name", "location") VALUES ($1, 'Resident One', 'House One')`,
    [RESIDENT_ID],
  );
  await client.query(
    `INSERT INTO "residents" ("id", "name", "location") VALUES ($1, 'Resident Two', 'House One')`,
    [RESIDENT_TWO_ID],
  );
  await client.query(`
		INSERT INTO "smoke_detector_checks"
			("id", "location", "smoke_status", "co_status", "notes")
		VALUES
			('33333333-3333-4333-8333-333333333333', 'House One', 'Pass', 'Fail', 'Keep exactly');
		INSERT INTO "fire_drills"
			("id", "location", "year", "sequence", "resident_name", "comment")
		VALUES
			('44444444-4444-4444-8444-444444444444', 'House One', 2025, 1, 'Legacy Resident', 'Do not group');
	`);
}

async function legacyFingerprint(client: PoolClient): Promise<unknown> {
  const result = await client.query(`
		SELECT
			(SELECT md5(jsonb_agg(to_jsonb(s) ORDER BY s.id)::text) FROM "smoke_detector_checks" s) AS smoke,
			(SELECT md5(jsonb_agg(to_jsonb(f) ORDER BY f.id)::text) FROM "fire_drills" f) AS drills,
			(SELECT count(*)::integer FROM "smoke_detector_checks") AS smoke_count,
			(SELECT count(*)::integer FROM "fire_drills") AS drill_count
	`);
  return result.rows[0];
}

async function exerciseInspectionConstraints(
  client: PoolClient,
): Promise<void> {
  const insertInspection = (equipmentType: string) =>
    client.query(
      `INSERT INTO "life_safety_inspection_entries" (
				"location_id", "house_name_snapshot", "report_year", "report_month",
				"equipment_type", "inspection_date", "staff_initials", "outcome", "created_by"
			) VALUES ($1, 'House One', 2026, 1, $2, '2026-01-15', 'MP', 'pass', 'actor')
			RETURNING "id"`,
      [LOCATION_ID, equipmentType],
    );

  const smoke = await insertInspection("smoke");
  await insertInspection("carbon_monoxide");
  await insertInspection("fire_extinguisher");

  await expectPgError(insertInspection("smoke"), "23505");
  await expectPgError(
    client.query(
      `INSERT INTO "life_safety_inspection_entries" (
				"location_id", "house_name_snapshot", "report_year", "report_month",
				"equipment_type", "inspection_date", "staff_initials", "outcome", "created_by"
			) VALUES ($1, 'House One', 2026, 1, 'smoke', '2026-02-01', 'MP', 'pass', 'actor')`,
      [LOCATION_ID],
    ),
    "23514",
  );

  await client.query(
    `UPDATE "life_safety_inspection_entries"
		 SET "voided_at" = now(), "voided_by" = 'actor', "void_reason" = 'Entered twice', "version" = 2
		 WHERE "id" = $1`,
    [smoke.rows[0].id],
  );
  await insertInspection("smoke");

  await client.query(
    `UPDATE "locations" SET "name" = 'House One Renamed' WHERE "id" = $1`,
    [LOCATION_ID],
  );
  const snapshots = await client.query(
    `SELECT DISTINCT "house_name_snapshot" FROM "life_safety_inspection_entries"`,
  );
  assert.deepEqual(snapshots.rows, [{ house_name_snapshot: "House One" }]);
}

async function exerciseFireDrillConstraints(client: PoolClient): Promise<void> {
  const report = await client.query(
    `INSERT INTO "fire_drill_reports" (
			"location_id", "house_name_snapshot", "report_year", "sequence", "drill_date",
			"drill_time", "staff_names", "created_by"
		) VALUES ($1, 'House One', 2026, 1, '2026-03-04', '14:05', $2::jsonb, 'actor')
		RETURNING "id"`,
    [LOCATION_ID, JSON.stringify(["Staff One"])],
  );
  const reportId = report.rows[0].id as string;

  await client.query(
    `INSERT INTO "fire_drill_participants" (
			"fire_drill_report_id", "resident_id", "resident_name_snapshot", "participant_source",
			"duration_minutes", "duration_seconds", "position"
		) VALUES ($1, $2, 'Resident One', 'roster', 0, 42, 0)`,
    [reportId, RESIDENT_ID],
  );
  await client.query(
    `INSERT INTO "fire_drill_participants" (
			"fire_drill_report_id", "resident_id", "resident_name_snapshot", "participant_source",
			"duration_minutes", "duration_seconds", "position"
		) VALUES ($1, $2, 'Resident Two', 'roster', $3, 5, 1)`,
    [reportId, RESIDENT_TWO_ID, MAX_FIRE_DRILL_DURATION_MINUTES],
  );

  await expectPgError(
    client.query(
      `INSERT INTO "fire_drill_participants" (
				"fire_drill_report_id", "resident_name_snapshot", "participant_source",
				"duration_minutes", "duration_seconds", "position"
			) VALUES ($1, 'Duplicate position', 'manual', 1, 0, 0)`,
      [reportId],
    ),
    "23505",
  );
  await expectPgError(
    client.query(
      `INSERT INTO "fire_drill_participants" (
				"fire_drill_report_id", "resident_name_snapshot", "participant_source",
				"duration_minutes", "duration_seconds", "position"
			) VALUES ($1, 'Bad duration', 'manual', 1, NULL, 1)`,
      [reportId],
    ),
    "23514",
  );
  await expectPgError(
    client.query(
      `INSERT INTO "fire_drill_participants" (
				"fire_drill_report_id", "resident_name_snapshot", "participant_source",
				"duration_minutes", "duration_seconds", "position"
			) VALUES ($1, 'Bad minutes', 'manual', 2147483648, 5, 2)`,
      [reportId],
    ),
    "23514",
  );
  await expectPgError(
    client.query(
      `INSERT INTO "fire_drill_participants" (
				"fire_drill_report_id", "resident_id", "resident_name_snapshot", "participant_source",
				"duration_minutes", "duration_seconds", "position"
			) VALUES ($1, 'Bad roster source', 'roster', 2, 15, 2)`,
      [reportId],
    ),
    "23514",
  );
  await expectPgError(
    client.query(
      `INSERT INTO "fire_drill_participants" (
				"fire_drill_report_id", "resident_id", "resident_name_snapshot", "participant_source",
				"duration_minutes", "duration_seconds", "position"
			) VALUES ($1, $2, 'Bad manual source', 'manual', 3, 15, 2)`,
      [reportId, RESIDENT_TWO_ID],
    ),
    "23514",
  );
  await expectPgError(
    client.query(
      `INSERT INTO "fire_drill_participants" (
				"fire_drill_report_id", "resident_name_snapshot", "participant_source",
				"duration_minutes", "duration_seconds", "position"
			) VALUES ($1, 'Bad seconds', 'manual', 1, 60, 1)`,
      [reportId],
    ),
    "23514",
  );
  await expectPgError(
    client.query(
      `INSERT INTO "fire_drill_participants" (
				"fire_drill_report_id", "resident_name_snapshot", "participant_source",
				"duration_minutes", "duration_seconds", "position"
			) VALUES ($1, 'No duration', 'manual', NULL, NULL, 1)`,
      [reportId],
    ),
    "23514",
  );

  await client.query(
    `UPDATE "residents" SET "name" = 'Resident Renamed' WHERE "id" = $1`,
    [RESIDENT_ID],
  );
  await client.query(`DELETE FROM "residents" WHERE "id" = $1`, [RESIDENT_ID]);
  const participantAfterDelete = await client.query(
    `SELECT "resident_id", "resident_name_snapshot" FROM "fire_drill_participants" WHERE "fire_drill_report_id" = $1 ORDER BY "position"`,
    [reportId],
  );
  assert.deepEqual(participantAfterDelete.rows, [
    { resident_id: null, resident_name_snapshot: "Resident One" },
    { resident_id: RESIDENT_TWO_ID, resident_name_snapshot: "Resident Two" },
  ]);

  await client.query(
    `INSERT INTO "life_safety_report_revisions" (
			"fire_drill_report_id", "entity_type", "version", "action", "snapshot", "actor_id"
		) VALUES ($1, 'fire_drill', 1, 'create', $2::jsonb, 'actor')`,
    [
      reportId,
      JSON.stringify({
        id: reportId,
        version: 1,
        participants: [{ residentNameSnapshot: "Resident One", position: 0 }],
      }),
    ],
  );
  await client.query(
    `UPDATE "fire_drill_reports"
		 SET "voided_at" = now(), "voided_by" = 'actor', "void_reason" = 'Superseded', "version" = 2
		 WHERE "id" = $1`,
    [reportId],
  );
  await client.query(
    `INSERT INTO "life_safety_report_revisions" (
			"fire_drill_report_id", "entity_type", "version", "action", "snapshot", "reason", "actor_id"
		) VALUES ($1, 'fire_drill', 2, 'void', $2::jsonb, 'Superseded', 'actor')`,
    [
      reportId,
      JSON.stringify({
        id: reportId,
        version: 2,
        voidReason: "Superseded",
        participants: [{ residentNameSnapshot: "Resident One", position: 0 }],
      }),
    ],
  );

  const auditState = await client.query(
    `SELECT
			(SELECT count(*)::integer FROM "fire_drill_participants" WHERE "fire_drill_report_id" = $1) AS participants,
			(SELECT count(*)::integer FROM "life_safety_report_revisions" WHERE "fire_drill_report_id" = $1) AS revisions`,
    [reportId],
  );
  assert.deepEqual(auditState.rows[0], { participants: 1, revisions: 2 });

  await client.query(
    `INSERT INTO "fire_drill_reports" (
			"location_id", "house_name_snapshot", "report_year", "sequence", "drill_date",
			"drill_time", "staff_names", "created_by"
		) VALUES ($1, 'House One Renamed', 2026, 1, '2026-06-04', '14:05', '["Staff One"]', 'actor')`,
    [LOCATION_ID],
  );

  await expectPgError(
    client.query(`DELETE FROM "locations" WHERE "id" = $1`, [LOCATION_ID]),
    "23503",
  );

  await client.query("BEGIN");
  try {
    const rolledBackReport = await client.query(
      `INSERT INTO "fire_drill_reports" (
				"location_id", "house_name_snapshot", "report_year", "sequence", "drill_date",
				"drill_time", "staff_names", "created_by"
			) VALUES ($1, 'House One Renamed', 2026, 2, '2026-09-04', '14:05', '["Staff One"]', 'actor')
			RETURNING "id"`,
      [LOCATION_ID],
    );
    await client.query(
      `INSERT INTO "fire_drill_participants" (
				"fire_drill_report_id", "resident_name_snapshot", "participant_source",
				"duration_minutes", "duration_seconds", "position"
			) VALUES ($1, 'Invalid participant', 'manual', 0, 60, 0)`,
      [rolledBackReport.rows[0].id],
    );
    assert.fail("Expected participant constraint to abort the transaction");
  } catch (error) {
    assert.equal(pgCode(error), "23514");
    await client.query("ROLLBACK");
  }

  const rolledBackCount = await client.query(
    `SELECT count(*)::integer AS count FROM "fire_drill_reports" WHERE "report_year" = 2026 AND "sequence" = 2`,
  );
  assert.equal(rolledBackCount.rows[0].count, 0);
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
