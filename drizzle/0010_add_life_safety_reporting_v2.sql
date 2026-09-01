-- Normalized life-safety reporting storage.
-- This migration is deliberately additive: the legacy smoke_detector_checks and
-- fire_drills tables are neither altered nor used as a backfill source.

ALTER TABLE "inspector_access"
	ADD COLUMN IF NOT EXISTS "location_id" uuid;

ALTER TABLE "inspector_access"
	ADD CONSTRAINT "inspector_access_location_fk"
	FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS "inspector_access_location_id_idx"
	ON "inspector_access" ("location_id");

WITH unique_active_locations AS (
	SELECT "name", min("id") AS "location_id"
	FROM "locations"
	WHERE "status" = 'active'
	GROUP BY "name"
	HAVING count(*) = 1
)
UPDATE "inspector_access" ia
SET "location_id" = ual."location_id"
FROM unique_active_locations ual
WHERE ia."location" = ual."name"
	AND ia."location_id" IS NULL;

CREATE TABLE IF NOT EXISTS "life_safety_inspection_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"house_name_snapshot" varchar(255) NOT NULL,
	"report_year" integer NOT NULL,
	"report_month" integer NOT NULL,
	"equipment_type" varchar(32) NOT NULL,
	"inspection_date" date NOT NULL,
	"staff_initials" varchar(50) NOT NULL,
	"outcome" varchar(20) NOT NULL,
	"notes" text,
	"version" integer DEFAULT 1 NOT NULL,
	"voided_at" timestamp,
	"voided_by" varchar(255),
	"void_reason" text,
	"created_by" varchar(255) NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "life_safety_inspection_entries_location_fk"
		FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
	CONSTRAINT "life_safety_inspection_entries_year_check"
		CHECK ("report_year" BETWEEN 2020 AND 2100),
	CONSTRAINT "life_safety_inspection_entries_month_check"
		CHECK ("report_month" BETWEEN 1 AND 12),
	CONSTRAINT "life_safety_inspection_entries_equipment_check"
		CHECK ("equipment_type" IN ('smoke', 'carbon_monoxide', 'fire_extinguisher')),
	CONSTRAINT "life_safety_inspection_entries_date_identity_check"
		CHECK (extract(year FROM "inspection_date") = "report_year" AND extract(month FROM "inspection_date") = "report_month"),
	CONSTRAINT "life_safety_inspection_entries_outcome_check"
		CHECK ("outcome" IN ('pass', 'fail')),
	CONSTRAINT "life_safety_inspection_entries_version_check"
		CHECK ("version" >= 1),
	CONSTRAINT "life_safety_inspection_entries_snapshot_check"
		CHECK (length(btrim("house_name_snapshot")) > 0 AND length(btrim("staff_initials")) > 0),
	CONSTRAINT "life_safety_inspection_entries_void_check"
		CHECK (
			("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL)
			OR
			("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND coalesce(length(btrim("void_reason")), 0) > 0)
		)
);

CREATE INDEX IF NOT EXISTS "life_safety_inspection_entries_location_year_idx"
	ON "life_safety_inspection_entries" ("location_id", "report_year");

CREATE UNIQUE INDEX IF NOT EXISTS "life_safety_inspection_entries_active_identity_uidx"
	ON "life_safety_inspection_entries" ("location_id", "report_year", "report_month", "equipment_type")
	WHERE "voided_at" IS NULL;

CREATE TABLE IF NOT EXISTS "fire_drill_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"house_name_snapshot" varchar(255) NOT NULL,
	"report_year" integer NOT NULL,
	"sequence" integer NOT NULL,
	"drill_date" date NOT NULL,
	"drill_time" time(0) without time zone NOT NULL,
	"staff_names" jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"voided_at" timestamp,
	"voided_by" varchar(255),
	"void_reason" text,
	"created_by" varchar(255) NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "fire_drill_reports_location_fk"
		FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
	CONSTRAINT "fire_drill_reports_year_check"
		CHECK ("report_year" BETWEEN 2020 AND 2100),
	CONSTRAINT "fire_drill_reports_sequence_check"
		CHECK ("sequence" IN (1, 2)),
	CONSTRAINT "fire_drill_reports_date_identity_check"
		CHECK (extract(year FROM "drill_date") = "report_year"),
	CONSTRAINT "fire_drill_reports_staff_names_check"
		CHECK (
			CASE WHEN jsonb_typeof("staff_names") = 'array'
				THEN jsonb_array_length("staff_names") BETWEEN 1 AND 24
					AND NOT jsonb_path_exists("staff_names", '$[*] ? (@.type() != "string" || @ == "")')
				ELSE false
			END
		),
	CONSTRAINT "fire_drill_reports_version_check"
		CHECK ("version" >= 1),
	CONSTRAINT "fire_drill_reports_snapshot_check"
		CHECK (length(btrim("house_name_snapshot")) > 0),
	CONSTRAINT "fire_drill_reports_void_check"
		CHECK (
			("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL)
			OR
			("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND coalesce(length(btrim("void_reason")), 0) > 0)
		)
);

CREATE INDEX IF NOT EXISTS "fire_drill_reports_location_year_idx"
	ON "fire_drill_reports" ("location_id", "report_year");

CREATE UNIQUE INDEX IF NOT EXISTS "fire_drill_reports_active_identity_uidx"
	ON "fire_drill_reports" ("location_id", "report_year", "sequence")
	WHERE "voided_at" IS NULL;

CREATE TABLE IF NOT EXISTS "fire_drill_participants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fire_drill_report_id" uuid NOT NULL,
	"resident_id" uuid,
	"resident_name_snapshot" varchar(255) NOT NULL,
	"participant_source" varchar(20) NOT NULL,
	"duration_minutes" integer,
	"duration_seconds" integer,
	"comment" text,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "fire_drill_participants_report_fk"
		FOREIGN KEY ("fire_drill_report_id") REFERENCES "fire_drill_reports"("id") ON DELETE CASCADE,
	CONSTRAINT "fire_drill_participants_resident_fk"
		FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE SET NULL,
	CONSTRAINT "fire_drill_participants_source_check"
		CHECK ("participant_source" IN ('roster', 'manual', 'external')),
	CONSTRAINT "fire_drill_participants_source_reference_check"
		CHECK (
			("participant_source" = 'roster' AND "resident_id" IS NOT NULL)
			OR
			("participant_source" IN ('manual', 'external') AND "resident_id" IS NULL)
		),
	CONSTRAINT "fire_drill_participants_duration_check"
		CHECK (
			("duration_minutes" IS NOT NULL AND "duration_minutes" BETWEEN 0 AND 2147483647 AND "duration_seconds" BETWEEN 0 AND 59)
			OR
			("duration_minutes" IS NULL AND "duration_seconds" IS NULL AND coalesce(length(btrim("comment")), 0) > 0)
		),
	CONSTRAINT "fire_drill_participants_position_check"
		CHECK ("position" BETWEEN 0 AND 63),
	CONSTRAINT "fire_drill_participants_snapshot_check"
		CHECK (length(btrim("resident_name_snapshot")) > 0)
);

CREATE INDEX IF NOT EXISTS "fire_drill_participants_report_idx"
	ON "fire_drill_participants" ("fire_drill_report_id");

CREATE UNIQUE INDEX IF NOT EXISTS "fire_drill_participants_position_uidx"
	ON "fire_drill_participants" ("fire_drill_report_id", "position");

CREATE UNIQUE INDEX IF NOT EXISTS "fire_drill_participants_resident_uidx"
	ON "fire_drill_participants" ("fire_drill_report_id", "resident_id")
	WHERE "resident_id" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "life_safety_report_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"inspection_entry_id" uuid,
	"fire_drill_report_id" uuid,
	"entity_type" varchar(20) NOT NULL,
	"version" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"snapshot" jsonb NOT NULL,
	"reason" text,
	"actor_id" varchar(255) NOT NULL,
	"actor_name_snapshot" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "life_safety_report_revisions_inspection_fk"
		FOREIGN KEY ("inspection_entry_id") REFERENCES "life_safety_inspection_entries"("id") ON DELETE RESTRICT,
	CONSTRAINT "life_safety_report_revisions_drill_fk"
		FOREIGN KEY ("fire_drill_report_id") REFERENCES "fire_drill_reports"("id") ON DELETE RESTRICT,
	CONSTRAINT "life_safety_report_revisions_entity_check"
		CHECK (
			("entity_type" = 'inspection' AND "inspection_entry_id" IS NOT NULL AND "fire_drill_report_id" IS NULL)
			OR
			("entity_type" = 'fire_drill' AND "fire_drill_report_id" IS NOT NULL AND "inspection_entry_id" IS NULL)
		),
	CONSTRAINT "life_safety_report_revisions_version_check"
		CHECK ("version" >= 1),
	CONSTRAINT "life_safety_report_revisions_action_check"
		CHECK ("action" IN ('create', 'correct', 'move', 'void')),
	CONSTRAINT "life_safety_report_revisions_snapshot_check"
		CHECK (jsonb_typeof("snapshot") = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS "life_safety_report_revisions_inspection_version_uidx"
	ON "life_safety_report_revisions" ("inspection_entry_id", "version")
	WHERE "inspection_entry_id" IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "life_safety_report_revisions_drill_version_uidx"
	ON "life_safety_report_revisions" ("fire_drill_report_id", "version")
	WHERE "fire_drill_report_id" IS NOT NULL;
