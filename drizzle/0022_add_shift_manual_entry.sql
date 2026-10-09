ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "entered_by" varchar(255);--> statement-breakpoint
ALTER TABLE "shifts" ADD COLUMN IF NOT EXISTS "entered_at" timestamp;