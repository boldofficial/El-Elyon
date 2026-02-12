-- Migration: Add Life Safety Document Tables (Smoke Detector Checks and Fire Drills)

-- Smoke Detector Checks Table (monthly frequency)
CREATE TABLE IF NOT EXISTS "smoke_detector_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location" varchar(255) NOT NULL,
	"date" timestamp NOT NULL,
	"smoke_status" varchar(50) NOT NULL,
	"co_status" varchar(50) NOT NULL,
	"staff_initials" varchar(50) NOT NULL,
	"notes" text,
	"created_by" varchar(255) NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);

CREATE INDEX IF NOT EXISTS "smoke_detector_checks_location_idx" ON "smoke_detector_checks" ("location");
CREATE INDEX IF NOT EXISTS "smoke_detector_checks_date_idx" ON "smoke_detector_checks" ("date");

-- Fire Drills Table (semiannual frequency)
CREATE TABLE IF NOT EXISTS "fire_drills" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"location" varchar(255) NOT NULL,
	"year" integer NOT NULL,
	"sequence" integer NOT NULL,
	"resident_name" varchar(255) NOT NULL,
	"date" timestamp NOT NULL,
	"time" varchar(50) NOT NULL,
	"staff_name" varchar(255) NOT NULL,
	"comment" text,
	"created_by" varchar(255) NOT NULL,
	"updated_by" varchar(255),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp
);

CREATE INDEX IF NOT EXISTS "fire_drills_location_idx" ON "fire_drills" ("location");
CREATE INDEX IF NOT EXISTS "fire_drills_year_idx" ON "fire_drills" ("year");
CREATE INDEX IF NOT EXISTS "fire_drills_sequence_idx" ON "fire_drills" ("sequence");
