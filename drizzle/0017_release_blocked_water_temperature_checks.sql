-- Releases water-temperature checks left stuck in the blocking states.
--
-- Until now an above-121.0F reading put the row into 'action_required' and
-- then 'recheck_required', and the shift's obligation stayed open until a
-- recheck came back inside the safe range. That pressured staff to type a
-- cooler number than the thermometer showed. deriveWaterTemperatureState no
-- longer produces either state: an out-of-range reading now completes and is
-- flagged ('complete_with_attention') for management review.
--
-- New rows get the new state on write. Rows written before this migration
-- keep whatever they were left with, so the reminder banner and clock-out
-- warning would go on nagging about them forever. This recomputes them to
-- the state the current rules would give them.
--
-- Nothing is lost: the original readings, any documented action text, and
-- every recheck row stay exactly as they were. Only the derived header
-- state changes, and only for rows whose readings are out of range by
-- definition (that is how they reached a blocking state at all). Voided rows
-- are left alone -- they are already excluded from every live surface, and
-- rewriting them would edit history for no benefit.
--
-- Re-runnable: the WHERE clause matches nothing on a second run.
UPDATE "water_temperature_checks"
SET "state" = 'complete_with_attention'
WHERE "state" IN ('action_required', 'recheck_required')
	AND "voided_at" IS NULL;
