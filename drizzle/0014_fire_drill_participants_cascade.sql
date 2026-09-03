-- fire_drill_participants.resident_id was ON DELETE SET NULL. That conflicts
-- with fire_drill_participants_source_reference_check, which requires a
-- 'roster' participant to have a non-null resident_id: deleting a resident
-- who took part (via roster) in a fire drill made Postgres try to null out
-- resident_id on their participant row, which then violated that check
-- constraint and rolled back the whole delete.
--
-- CASCADE removes the participant row instead of trying to null the column.
-- resident_name_snapshot on that row still preserves the human-readable
-- record of who attended.
ALTER TABLE "fire_drill_participants"
	DROP CONSTRAINT IF EXISTS "fire_drill_participants_resident_fk";--> statement-breakpoint

ALTER TABLE "fire_drill_participants"
	ADD CONSTRAINT "fire_drill_participants_resident_fk"
	FOREIGN KEY ("resident_id") REFERENCES "residents"("id") ON DELETE cascade ON UPDATE no action;
