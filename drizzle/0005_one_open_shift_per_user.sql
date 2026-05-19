-- Enforce one active shift per user across all locations.
CREATE UNIQUE INDEX IF NOT EXISTS "shifts_one_open_shift_per_user_idx"
	ON "shifts" ("clerk_user_id")
	WHERE "clock_out_time" IS NULL;
