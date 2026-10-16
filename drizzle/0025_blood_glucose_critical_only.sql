ALTER TABLE "blood_glucose_logs" DROP CONSTRAINT "blood_glucose_logs_status_check";--> statement-breakpoint
-- Only critical readings are flagged now. Readings saved as low/high under
-- the old target range become normal and no longer owe a recheck.
UPDATE "blood_glucose_logs" SET "status" = 'in_range', "recheck_due_at" = NULL WHERE "status" IN ('low', 'high');--> statement-breakpoint
ALTER TABLE "blood_glucose_logs" DROP COLUMN "target_low_mg_dl";--> statement-breakpoint
ALTER TABLE "blood_glucose_logs" DROP COLUMN "target_high_mg_dl";--> statement-breakpoint
ALTER TABLE "residents" DROP COLUMN "glucose_target_low_mg_dl";--> statement-breakpoint
ALTER TABLE "residents" DROP COLUMN "glucose_target_high_mg_dl";--> statement-breakpoint
ALTER TABLE "blood_glucose_logs" ADD CONSTRAINT "blood_glucose_logs_status_check" CHECK ("blood_glucose_logs"."status" in ('critical_low', 'in_range', 'critical_high', 'refused'));