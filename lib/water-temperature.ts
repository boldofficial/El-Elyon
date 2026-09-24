import { z } from "zod";

import { isValidLocalDate } from "./life-safety-reporting";

// Thermometer input range: 0-250F is a valid *input* reading regardless of
// whether it is operationally safe. Safety is derived separately (see
// classifyFixtureReading) so an out-of-range safety observation (e.g. 118.0F)
// is still a valid, storable fact rather than a rejected value.
export const WATER_TEMP_MIN_TENTHS = 0;
export const WATER_TEMP_MAX_TENTHS = 2500;

// Flagging thresholds. `SAFE_MIN_TENTHS` still matches the supplied paper
// form's 110F floor: a reading under it stays visible as
// `complete_with_attention`.
//
// `SAFE_MAX_TENTHS` no longer matches the form. The form's printed guidance
// and escalation footer are transcribed at 115F and are deliberately left
// that way (see ABOVE_115_ESCALATION_INSTRUCTIONS and
// WATER_TEMPERATURE_SAFE_RANGE_VALUE), but by operational decision only a
// reading ABOVE 121.0F now triggers the corrective-action/recheck workflow.
// Readings from 115.1F through 121.0F therefore complete normally even
// though the printed sheet still instructs staff to restrict resident use
// above 115F. This divergence is intentional and known.
//
// These two constants are the single source of truth for classification --
// every threshold-derived label, badge, and print annotation reads from them
// rather than repeating a literal, so the workflow and what staff/inspectors
// are shown can never drift apart again.
export const SAFE_MIN_TENTHS = 1100;
export const SAFE_MAX_TENTHS = 1210;

export const SHIFT_SLOTS = [1, 2, 3] as const;
export type ShiftSlot = (typeof SHIFT_SLOTS)[number];

export const WATER_TEMPERATURE_FIXTURES = ["kitchen", "bath_shower"] as const;
export type WaterTemperatureFixture =
  (typeof WATER_TEMPERATURE_FIXTURES)[number];

// Stored header states. "missing" is intentionally not a stored state: it is
// the absence of an active row for a given location/date/slot, derived by
// callers rather than persisted (see KTD4/KTD5 in the daily water-temperature
// checks plan).
export const WATER_TEMPERATURE_CHECK_STATES = [
  "complete",
  "complete_with_attention",
  "action_required",
  "recheck_required",
] as const;
export type WaterTemperatureCheckState =
  (typeof WATER_TEMPERATURE_CHECK_STATES)[number];

export const WATER_TEMPERATURE_REVISION_ACTIONS = [
  "create",
  "correct",
  "action",
  "recheck",
  "supersede",
  "void",
] as const;
export type WaterTemperatureRevisionAction =
  (typeof WATER_TEMPERATURE_REVISION_ACTIONS)[number];

export type FixtureClassification = "safe" | "below" | "above";

const MAX_STAFF_ID_LENGTH = 255;
const MAX_STAFF_NAME_LENGTH = 255;
const MAX_STAFF_INITIALS_LENGTH = 10;
export const MAX_COMMENT_LENGTH = 2000;
export const MAX_ACTION_LENGTH = 2000;
export const MAX_VOID_REASON_LENGTH = 1000;
export const MAX_SUPERSEDE_REASON_LENGTH = 1000;

/**
 * Converts a decimal Fahrenheit reading (at most one decimal place, 0-250) to
 * an integer tenths-of-a-degree value for storage/comparison, or null if the
 * value is not finite, out of range, or carries more than one decimal digit
 * of precision.
 *
 * This avoids binary-floating-point identity comparisons: rather than
 * comparing decimal values directly, we round to the nearest tenth and use an
 * epsilon tolerance (1e-6) to detect genuinely higher precision input (e.g.
 * 114.87 is rejected) while tolerating ordinary double-precision rounding
 * error (e.g. 114.9 is accepted even though it is not exactly representable
 * in binary).
 */
export function toFahrenheitTenths(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  if (value < 0 || value > 250) return null;
  const scaled = value * 10;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) > 1e-6) return null;
  if (rounded < WATER_TEMP_MIN_TENTHS || rounded > WATER_TEMP_MAX_TENTHS) {
    return null;
  }
  return rounded;
}

/** Presentation-only: tenths back to a one-decimal Fahrenheit number. */
export function tenthsToFahrenheit(tenths: number): number {
  return tenths / 10;
}

/**
 * The classification thresholds as plain Fahrenheit numbers, for building
 * user-facing labels. Derived, never retyped: a label that hardcodes its own
 * number will silently disagree with the workflow the next time a threshold
 * moves. These describe what the system FLAGS -- they are not the paper
 * form's printed guidance, which is transcribed separately and verbatim.
 */
export const SAFE_MIN_F = tenthsToFahrenheit(SAFE_MIN_TENTHS);
export const SAFE_MAX_F = tenthsToFahrenheit(SAFE_MAX_TENTHS);

/**
 * The ceiling printed on the supplied paper form (115.0F), as a number.
 *
 * This is NOT a flagging threshold. It exists so surfaces can tell staff when
 * a reading falls in the band the form calls unsafe but the software does not
 * flag -- above FORM_GUIDANCE_MAX_TENTHS, at or below SAFE_MAX_TENTHS. Nothing
 * in the compliance state machine reads it: `classifyFixtureReading` and
 * `deriveWaterTemperatureState` are driven solely by SAFE_MIN/SAFE_MAX, so an
 * advisory can never create, clear, or alter an obligation.
 *
 * When the two ceilings are reconciled -- by reissuing the form, or by moving
 * SAFE_MAX_TENTHS back -- setting this equal to SAFE_MAX_TENTHS empties the
 * advisory band and every surface goes quiet on its own.
 */
export const FORM_GUIDANCE_MAX_TENTHS = 1150;
export const FORM_GUIDANCE_MAX_F = tenthsToFahrenheit(FORM_GUIDANCE_MAX_TENTHS);

/**
 * True when `tenths` sits in the advisory band: not flagged by the software,
 * but above the printed form's published ceiling. Always false once the two
 * ceilings agree, and false for anything the system does flag -- an
 * above-range reading is already urgent and must not be softened into an
 * advisory.
 */
export function isAboveFormGuidance(tenths: number): boolean {
  return tenths > FORM_GUIDANCE_MAX_TENTHS && tenths <= SAFE_MAX_TENTHS;
}

/** Classifies a single fixture's reading against the safe range: below
 * SAFE_MIN_F, above SAFE_MAX_F, or safe (inclusive of both bounds). */
export function classifyFixtureReading(tenths: number): FixtureClassification {
  if (tenths < SAFE_MIN_TENTHS) return "below";
  if (tenths > SAFE_MAX_TENTHS) return "above";
  return "safe";
}

/** Checks whether a string is a timezone identifier the runtime recognizes. */
export function isValidIanaTimeZone(value: string): boolean {
  if (typeof value !== "string" || value.trim().length === 0) return false;
  try {
    // Intl throws a RangeError for an unrecognized time zone identifier.
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export interface WaterTemperatureRecheckFact {
  fixture: WaterTemperatureFixture;
  tempTenths: number;
  sequence: number;
  supersededAt?: Date | string | null;
  voidedAt?: Date | string | null;
}

/**
 * Computes the derived header state from the immutable initial readings:
 *
 *   missing -> complete | complete_with_attention
 *
 * Recording a reading always completes the shift's obligation. An
 * out-of-range reading -- in EITHER direction -- is flagged
 * (`complete_with_attention`) for management review and nothing more.
 *
 * This deliberately no longer returns `action_required` or
 * `recheck_required`. Those states made an above-SAFE_MAX_F reading block
 * the worker until they documented a corrective action AND rechecked the
 * fixture until it read safe, which pressured staff to type a lower number
 * than the one on the thermometer. A measurement is a fact; the software's
 * job is to record it truthfully and make the problem visible, not to
 * withhold completion until the fact changes. Both states remain in
 * WATER_TEMPERATURE_CHECK_STATES and are still rendered everywhere, because
 * rows written before this change still carry them (see migration
 * 0017_release_blocked_water_temperature_checks.sql, which recomputes the
 * ones that were left stuck).
 *
 * The flag is derived from the ORIGINAL readings alone. A later safe recheck
 * is additional evidence recorded against the row; it does not unflag the
 * row, because the water genuinely was out of range when it was measured
 * (R7).
 *
 * `rechecks` is still accepted so callers that recompute state after
 * appending a recheck need no change, and so re-adding a recheck-driven
 * state later is a one-function edit.
 */
export function deriveWaterTemperatureState(args: {
  kitchenTempTenths: number;
  bathTempTenths: number;
  hasAction?: boolean;
  rechecks?: readonly WaterTemperatureRecheckFact[];
}): WaterTemperatureCheckState {
  return hasOutOfRangeReading(args) ? "complete_with_attention" : "complete";
}

/** True when either initial reading sits outside the safe range. */
export function hasOutOfRangeReading(args: {
  kitchenTempTenths: number;
  bathTempTenths: number;
}): boolean {
  return outOfRangeFixtures(args).length > 0;
}

/** Which fixtures are flagged, and in which direction. Drives the "too high"
 * / "too low" wording so no surface has to re-derive it from a threshold. */
export function outOfRangeFixtures(args: {
  kitchenTempTenths: number;
  bathTempTenths: number;
}): Array<{fixture: WaterTemperatureFixture; direction: "above" | "below"}> {
  const classification: Record<WaterTemperatureFixture, FixtureClassification> = {
    kitchen: classifyFixtureReading(args.kitchenTempTenths),
    bath_shower: classifyFixtureReading(args.bathTempTenths),
  };
  return WATER_TEMPERATURE_FIXTURES.flatMap((fixture) =>
    classification[fixture] === "safe"
      ? []
      : [{fixture, direction: classification[fixture] as "above" | "below"}],
  );
}

/**
 * One sentence naming why a row is flagged, for staff- and supervisor-facing
 * copy. Returns null for a row with nothing flagged.
 */
export function describeAttentionReason(args: {
  kitchenTempTenths: number;
  bathTempTenths: number;
}): string | null {
  const flagged = outOfRangeFixtures(args);
  if (flagged.length === 0) return null;
  const directions = new Set(flagged.map((entry) => entry.direction));
  if (directions.has("above") && directions.has("below")) {
    return `One reading is above ${SAFE_MAX_F}°F and another is below ${SAFE_MIN_F}°F. Both are flagged for management review.`;
  }
  const count = flagged.length > 1 ? "Both readings are" : "A reading is";
  return directions.has("above")
    ? `${count} above ${SAFE_MAX_F}°F — too high. Flagged for management review.`
    : `${count} below ${SAFE_MIN_F}°F — too low. Flagged for management review.`;
}

/** Deterministic next sequence number for an append-only recheck fixture. */
export function nextRecheckSequence(
  existingSequences: readonly number[],
): number {
  return existingSequences.length === 0 ? 1 : Math.max(...existingSequences) + 1;
}

const UUID_SCHEMA = z.string().uuid();

const boundedText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(maximum, `${label} must be ${maximum} characters or fewer`);

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

export const shiftSlotSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
]);

export const operationalDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a local date in YYYY-MM-DD format")
  .refine(isValidLocalDate, "Invalid local calendar date");

export const organizationTimeZoneSchema = z
  .string()
  .trim()
  .min(1, "Timezone is required")
  .refine(isValidIanaTimeZone, "Must be a valid IANA time zone identifier");

export const fahrenheitReadingSchema = z
  .number()
  .finite("Temperature must be a finite number")
  .transform((value, ctx) => {
    const tenths = toFahrenheitTenths(value);
    if (tenths === null) {
      ctx.addIssue({
        code: "custom",
        message:
          "Temperature must be between 0 and 250°F with at most one decimal place",
      });
      return z.NEVER;
    }
    return tenths;
  });

export const staffIdSchema = boundedText("Staff ID", MAX_STAFF_ID_LENGTH);
export const staffNameSchema = boundedText(
  "Staff name",
  MAX_STAFF_NAME_LENGTH,
);
export const staffInitialsSchema = boundedText(
  "Staff initials",
  MAX_STAFF_INITIALS_LENGTH,
);

export const waterTemperatureCheckInputSchema = z
  .object({
    locationId: UUID_SCHEMA,
    shiftId: UUID_SCHEMA.nullable(),
    shiftSlot: shiftSlotSchema,
    operationalDate: operationalDateSchema,
    kitchenTempF: fahrenheitReadingSchema,
    bathTempF: fahrenheitReadingSchema,
    staffId: staffIdSchema,
    staffName: staffNameSchema,
    staffInitials: staffInitialsSchema,
    observedAt: z.coerce.date(),
    comments: optionalText(MAX_COMMENT_LENGTH),
    action: optionalText(MAX_ACTION_LENGTH),
  })
  .strict();

export const waterTemperatureActionInputSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    action: boundedText("Action taken", MAX_ACTION_LENGTH),
    staffId: staffIdSchema,
    staffName: staffNameSchema,
    staffInitials: staffInitialsSchema,
  })
  .strict();

export const waterTemperatureRecheckInputSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    fixture: z.enum(WATER_TEMPERATURE_FIXTURES),
    tempF: fahrenheitReadingSchema,
    staffId: staffIdSchema,
    staffName: staffNameSchema,
    staffInitials: staffInitialsSchema,
    measuredAt: z.coerce.date(),
  })
  .strict();

export const waterTemperatureRecheckSupersedeInputSchema = z
  .object({
    reason: boundedText("Supersede reason", MAX_SUPERSEDE_REASON_LENGTH),
  })
  .strict();

export const waterTemperatureVoidInputSchema = z
  .object({
    expectedVersion: z.number().int().min(1),
    reason: boundedText("Void reason", MAX_VOID_REASON_LENGTH),
  })
  .strict();

export type WaterTemperatureCheckInput = z.infer<
  typeof waterTemperatureCheckInputSchema
>;
export type WaterTemperatureActionInput = z.infer<
  typeof waterTemperatureActionInputSchema
>;
export type WaterTemperatureRecheckInput = z.infer<
  typeof waterTemperatureRecheckInputSchema
>;
export type WaterTemperatureRecheckSupersedeInput = z.infer<
  typeof waterTemperatureRecheckSupersedeInputSchema
>;
export type WaterTemperatureVoidInput = z.infer<
  typeof waterTemperatureVoidInputSchema
>;
