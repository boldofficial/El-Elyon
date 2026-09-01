-- Fixes a defect in the U1 migration (0011): the original
-- water_temperature_checks_action_required_check constraint required
-- non-blank `action` text whenever `state IN ('action_required', 'recheck_required')`.
--
-- Per lib/water-temperature.ts's deriveWaterTemperatureState (the single
-- source of truth for this state machine) and the daily water-temperature
-- checks plan (R6, KTD4, AE3), `action_required` is precisely the state a
-- fresh above-115F observation lands in *before* any corrective action has
-- been documented -- action is what later advances the row to
-- `recheck_required`. The original constraint made it impossible to ever
-- persist that state (every attempt to INSERT/UPDATE a bare "just observed,
-- unresolved, no action yet" row was rejected with 23514), which blocks the
-- feature's core above-115 workflow entirely.
--
-- `recheck_required` legitimately still requires non-blank action (it is
-- only reachable via the 'action' mutation, which always sets action text
-- before advancing state), so this migration narrows the gate to that one
-- state instead of dropping the safety net entirely.
--
-- Table has no production rows yet (feature not launched), so this is a
-- safe, additive, immediately-validated constraint replacement.

ALTER TABLE "water_temperature_checks"
	DROP CONSTRAINT "water_temperature_checks_action_required_check";

ALTER TABLE "water_temperature_checks"
	ADD CONSTRAINT "water_temperature_checks_action_required_check"
	CHECK (
		"state" <> 'recheck_required'
		OR ("action" IS NOT NULL AND length(btrim("action")) > 0)
	);
