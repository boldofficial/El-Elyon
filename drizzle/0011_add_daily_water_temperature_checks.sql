-- Daily water-temperature checks (Unit U1: schema/storage only).
-- Additive migration: existing shifts and config rows are preserved. New
-- shift identity columns are nullable so legacy open/closed shifts remain
-- valid; a later unit adds a one-time classification flow for open legacy
-- shifts and begins requiring the full identity on new clock-ins.

ALTER TABLE "shifts"
	ADD COLUMN IF NOT EXISTS "location_id" uuid,
	ADD COLUMN IF NOT EXISTS "shift_slot" integer,
	ADD COLUMN IF NOT EXISTS "operational_date" date,
	ADD COLUMN IF NOT EXISTS "operational_time_zone_snapshot" varchar(100);

ALTER TABLE "shifts"
	ADD CONSTRAINT "shifts_location_fk"
	FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS "shifts_location_id_idx"
	ON "shifts" ("location_id");

CREATE INDEX IF NOT EXISTS "shifts_operational_date_idx"
	ON "shifts" ("location_id", "operational_date");

ALTER TABLE "shifts"
	ADD CONSTRAINT "shifts_shift_slot_check"
	CHECK ("shift_slot" IS NULL OR "shift_slot" IN (1, 2, 3));

ALTER TABLE "shifts"
	ADD CONSTRAINT "shifts_identity_completeness_check"
	CHECK (
		(
			"location_id" IS NULL AND "shift_slot" IS NULL AND
			"operational_date" IS NULL AND "operational_time_zone_snapshot" IS NULL
		)
		OR
		(
			"location_id" IS NOT NULL AND "shift_slot" IS NOT NULL AND
			"operational_date" IS NOT NULL AND "operational_time_zone_snapshot" IS NOT NULL
		)
	);

-- Canonical organization-local timezone. Existing config rows (and any future
-- row that omits the field) fall back to America/Chicago; IANA validity is
-- enforced in application code (lib/water-temperature.ts), not here.
ALTER TABLE "config"
	ADD COLUMN IF NOT EXISTS "operational_time_zone" varchar(100)
		NOT NULL DEFAULT 'America/Chicago';

ALTER TABLE "config"
	ADD CONSTRAINT "config_operational_time_zone_check"
	CHECK (length(btrim("operational_time_zone")) > 0);

CREATE TABLE IF NOT EXISTS "water_temperature_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location_id" uuid NOT NULL,
	"house_name_snapshot" varchar(255) NOT NULL,
	"operational_date" date NOT NULL,
	"shift_slot" integer NOT NULL,
	"shift_id" uuid,
	"kitchen_temp_tenths" integer NOT NULL,
	"bath_temp_tenths" integer NOT NULL,
	"staff_id" varchar(255) NOT NULL,
	"staff_name_snapshot" varchar(255) NOT NULL,
	"staff_initials_snapshot" varchar(10) NOT NULL,
	"observed_at" timestamp NOT NULL,
	"comments" text,
	"action" text,
	"state" varchar(30) NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"voided_at" timestamp,
	"voided_by" varchar(255),
	"void_reason" text,
	"created_by" varchar(255) NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "water_temperature_checks_location_fk"
		FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE RESTRICT,
	CONSTRAINT "water_temperature_checks_shift_fk"
		FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL,
	CONSTRAINT "water_temperature_checks_shift_slot_check"
		CHECK ("shift_slot" IN (1, 2, 3)),
	CONSTRAINT "water_temperature_checks_kitchen_temp_check"
		CHECK ("kitchen_temp_tenths" BETWEEN 0 AND 2500),
	CONSTRAINT "water_temperature_checks_bath_temp_check"
		CHECK ("bath_temp_tenths" BETWEEN 0 AND 2500),
	CONSTRAINT "water_temperature_checks_state_check"
		CHECK ("state" IN ('complete', 'complete_with_attention', 'action_required', 'recheck_required')),
	CONSTRAINT "water_temperature_checks_version_check"
		CHECK ("version" >= 1),
	CONSTRAINT "water_temperature_checks_snapshot_check"
		CHECK (
			length(btrim("house_name_snapshot")) > 0 AND
			length(btrim("staff_name_snapshot")) > 0 AND
			length(btrim("staff_initials_snapshot")) > 0 AND
			length(btrim("staff_id")) > 0
		),
	CONSTRAINT "water_temperature_checks_action_required_check"
		CHECK (
			"state" NOT IN ('action_required', 'recheck_required')
			OR ("action" IS NOT NULL AND length(btrim("action")) > 0)
		),
	CONSTRAINT "water_temperature_checks_void_check"
		CHECK (
			("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL)
			OR
			("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND coalesce(length(btrim("void_reason")), 0) > 0)
		)
);

CREATE INDEX IF NOT EXISTS "water_temperature_checks_location_date_idx"
	ON "water_temperature_checks" ("location_id", "operational_date");

CREATE INDEX IF NOT EXISTS "water_temperature_checks_shift_id_idx"
	ON "water_temperature_checks" ("shift_id");

CREATE UNIQUE INDEX IF NOT EXISTS "water_temperature_checks_active_identity_uidx"
	ON "water_temperature_checks" ("location_id", "operational_date", "shift_slot")
	WHERE "voided_at" IS NULL;

CREATE TABLE IF NOT EXISTS "water_temperature_rechecks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" uuid NOT NULL,
	"fixture" varchar(20) NOT NULL,
	"temp_tenths" integer NOT NULL,
	"staff_id" varchar(255) NOT NULL,
	"staff_name_snapshot" varchar(255) NOT NULL,
	"staff_initials_snapshot" varchar(10) NOT NULL,
	"measured_at" timestamp NOT NULL,
	"sequence" integer NOT NULL,
	"superseded_at" timestamp,
	"superseded_by" varchar(255),
	"superseded_reason" text,
	"voided_at" timestamp,
	"voided_by" varchar(255),
	"void_reason" text,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "water_temperature_rechecks_check_fk"
		FOREIGN KEY ("check_id") REFERENCES "water_temperature_checks"("id") ON DELETE RESTRICT,
	CONSTRAINT "water_temperature_rechecks_fixture_check"
		CHECK ("fixture" IN ('kitchen', 'bath_shower')),
	CONSTRAINT "water_temperature_rechecks_temp_check"
		CHECK ("temp_tenths" BETWEEN 0 AND 2500),
	CONSTRAINT "water_temperature_rechecks_sequence_check"
		CHECK ("sequence" >= 1),
	CONSTRAINT "water_temperature_rechecks_snapshot_check"
		CHECK (
			length(btrim("staff_name_snapshot")) > 0 AND
			length(btrim("staff_initials_snapshot")) > 0 AND
			length(btrim("staff_id")) > 0
		),
	CONSTRAINT "water_temperature_rechecks_superseded_check"
		CHECK (
			("superseded_at" IS NULL AND "superseded_by" IS NULL AND "superseded_reason" IS NULL)
			OR
			("superseded_at" IS NOT NULL AND "superseded_by" IS NOT NULL AND coalesce(length(btrim("superseded_reason")), 0) > 0)
		),
	CONSTRAINT "water_temperature_rechecks_void_check"
		CHECK (
			("voided_at" IS NULL AND "voided_by" IS NULL AND "void_reason" IS NULL)
			OR
			("voided_at" IS NOT NULL AND "voided_by" IS NOT NULL AND coalesce(length(btrim("void_reason")), 0) > 0)
		)
);

CREATE INDEX IF NOT EXISTS "water_temperature_rechecks_check_id_idx"
	ON "water_temperature_rechecks" ("check_id");

CREATE UNIQUE INDEX IF NOT EXISTS "water_temperature_rechecks_check_fixture_sequence_uidx"
	ON "water_temperature_rechecks" ("check_id", "fixture", "sequence");

CREATE TABLE IF NOT EXISTS "water_temperature_check_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"check_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"before_snapshot" jsonb,
	"after_snapshot" jsonb NOT NULL,
	"reason" text,
	"actor_id" varchar(255) NOT NULL,
	"actor_name_snapshot" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "water_temperature_check_revisions_check_fk"
		FOREIGN KEY ("check_id") REFERENCES "water_temperature_checks"("id") ON DELETE RESTRICT,
	CONSTRAINT "water_temperature_check_revisions_action_check"
		CHECK ("action" IN ('create', 'correct', 'action', 'recheck', 'supersede', 'void')),
	CONSTRAINT "water_temperature_check_revisions_version_check"
		CHECK ("version" >= 1),
	CONSTRAINT "water_temperature_check_revisions_after_snapshot_check"
		CHECK (jsonb_typeof("after_snapshot") = 'object'),
	CONSTRAINT "water_temperature_check_revisions_before_snapshot_check"
		CHECK ("before_snapshot" IS NULL OR jsonb_typeof("before_snapshot") = 'object')
);

CREATE INDEX IF NOT EXISTS "water_temperature_check_revisions_check_id_idx"
	ON "water_temperature_check_revisions" ("check_id");

CREATE UNIQUE INDEX IF NOT EXISTS "water_temperature_check_revisions_check_version_uidx"
	ON "water_temperature_check_revisions" ("check_id", "version");
