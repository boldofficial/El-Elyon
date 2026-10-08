ALTER TABLE "resident_logs" ADD COLUMN IF NOT EXISTS "logged_for_date" date;--> statement-breakpoint
ALTER TABLE "resident_logs" ADD COLUMN IF NOT EXISTS "late_entry_reason" text;