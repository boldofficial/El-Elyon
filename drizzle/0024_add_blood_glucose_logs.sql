CREATE TABLE "blood_glucose_log_revisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"log_id" uuid NOT NULL,
	"previous" jsonb NOT NULL,
	"reason" text NOT NULL,
	"revised_by" varchar(255) NOT NULL,
	"revised_by_name" varchar(255) NOT NULL,
	"revised_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blood_glucose_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resident_id" uuid NOT NULL,
	"location" varchar(255) NOT NULL,
	"operational_date" date NOT NULL,
	"checked_at" timestamp NOT NULL,
	"check_type" varchar(30) NOT NULL,
	"method" varchar(20) DEFAULT 'fingerstick' NOT NULL,
	"refused" boolean DEFAULT false NOT NULL,
	"refusal_reason" text,
	"reading_value" numeric(5, 1),
	"reading_unit" varchar(10) DEFAULT 'mg_dl' NOT NULL,
	"reading_mg_dl" integer,
	"status" varchar(20) NOT NULL,
	"critical_low_mg_dl" integer NOT NULL,
	"target_low_mg_dl" integer NOT NULL,
	"target_high_mg_dl" integer NOT NULL,
	"critical_high_mg_dl" integer NOT NULL,
	"symptoms" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"actions_taken" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notified_who" varchar(255),
	"insulin_given" boolean DEFAULT false NOT NULL,
	"insulin_type" varchar(100),
	"insulin_units" numeric(5, 1),
	"recheck_due_at" timestamp,
	"recheck_of_id" uuid,
	"notes" text,
	"shift_id" uuid,
	"staff_id" varchar(255) NOT NULL,
	"staff_name_snapshot" varchar(255) NOT NULL,
	"logged_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	"updated_by" varchar(255),
	"reviewed_at" timestamp,
	"reviewed_by" varchar(255),
	"reviewed_by_name" varchar(255),
	"review_comment" text,
	CONSTRAINT "blood_glucose_logs_check_type_check" CHECK ("blood_glucose_logs"."check_type" in ('fasting', 'before_breakfast', 'before_lunch', 'before_dinner', 'bedtime', 'after_meal', 'prn', 'recheck')),
	CONSTRAINT "blood_glucose_logs_method_check" CHECK ("blood_glucose_logs"."method" in ('fingerstick', 'cgm', 'lab')),
	CONSTRAINT "blood_glucose_logs_unit_check" CHECK ("blood_glucose_logs"."reading_unit" in ('mg_dl', 'mmol_l')),
	CONSTRAINT "blood_glucose_logs_status_check" CHECK ("blood_glucose_logs"."status" in ('critical_low', 'low', 'in_range', 'high', 'critical_high', 'refused')),
	CONSTRAINT "blood_glucose_logs_reading_presence_check" CHECK (("blood_glucose_logs"."refused" and "blood_glucose_logs"."reading_mg_dl" is null and "blood_glucose_logs"."status" = 'refused') or (not "blood_glucose_logs"."refused" and "blood_glucose_logs"."reading_mg_dl" is not null and "blood_glucose_logs"."status" <> 'refused'))
);
--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "glucose_tracking_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "glucose_critical_low_mg_dl" integer;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "glucose_target_low_mg_dl" integer;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "glucose_target_high_mg_dl" integer;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "glucose_critical_high_mg_dl" integer;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "glucose_scheduled_checks" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "residents" ADD COLUMN "glucose_care_instructions" text;--> statement-breakpoint
ALTER TABLE "blood_glucose_log_revisions" ADD CONSTRAINT "blood_glucose_log_revisions_log_id_blood_glucose_logs_id_fk" FOREIGN KEY ("log_id") REFERENCES "public"."blood_glucose_logs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_glucose_logs" ADD CONSTRAINT "blood_glucose_logs_resident_id_residents_id_fk" FOREIGN KEY ("resident_id") REFERENCES "public"."residents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_glucose_logs" ADD CONSTRAINT "blood_glucose_logs_recheck_of_id_blood_glucose_logs_id_fk" FOREIGN KEY ("recheck_of_id") REFERENCES "public"."blood_glucose_logs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blood_glucose_logs" ADD CONSTRAINT "blood_glucose_logs_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blood_glucose_log_revisions_log_idx" ON "blood_glucose_log_revisions" USING btree ("log_id","revised_at");--> statement-breakpoint
CREATE INDEX "blood_glucose_logs_resident_date_idx" ON "blood_glucose_logs" USING btree ("resident_id","operational_date");--> statement-breakpoint
CREATE INDEX "blood_glucose_logs_location_date_idx" ON "blood_glucose_logs" USING btree ("location","operational_date");--> statement-breakpoint
CREATE UNIQUE INDEX "blood_glucose_logs_recheck_of_uidx" ON "blood_glucose_logs" USING btree ("recheck_of_id") WHERE "blood_glucose_logs"."recheck_of_id" is not null;