-- Migration: Add emergency contact to residents

ALTER TABLE "residents"
	ADD COLUMN IF NOT EXISTS "emergency_contact" text;
