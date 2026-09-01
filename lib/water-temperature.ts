import { z } from "zod";

import { isValidLocalDate } from "./life-safety-reporting";

// Thermometer input range: 0-250F is a valid *input* reading regardless of
// whether it is operationally safe. Safety is derived separately (see
// classifyFixtureReading) so an out-of-range safety observation (e.g. 118.0F)
// is still a valid, storable fact rather than a rejected value.
export const WATER_TEMP_MIN_TENTHS = 0;
export const WATER_TEMP_MAX_TENTHS = 2500;

// The supplied form's safe range is 110F-115F inclusive.
export const SAFE_MIN_TENTHS = 1100;
export const SAFE_MAX_TENTHS = 1150;

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

/** Classifies a single fixture's reading against the safe 110-115F range. */
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
 * Computes the derived header state from the immutable initial readings,
 * whether corrective action has been documented, and the currently active
 * (non-superseded, non-voided) rechecks, per KTD4's state machine:
 *
 *   missing -> complete | complete_with_attention | action_required
 *     -> recheck_required -> complete
 *
 * "missing" is not returned here: this function only derives the state for a
 * row that already exists. A fixture that started above 115F keeps that
 * requirement even if the same header also had a below-110F fixture; the
 * above-115 workflow takes precedence in the state label while the original
 * readings (including any below-range fixture) remain visible on the stored
 * row regardless of state.
 */
export function deriveWaterTemperatureState(args: {
  kitchenTempTenths: number;
  bathTempTenths: number;
  hasAction: boolean;
  rechecks: readonly WaterTemperatureRecheckFact[];
}): WaterTemperatureCheckState {
  const classification: Record<WaterTemperatureFixture, FixtureClassification> = {
    kitchen: classifyFixtureReading(args.kitchenTempTenths),
    bath_shower: classifyFixtureReading(args.bathTempTenths),
  };

  const affectedFixtures = WATER_TEMPERATURE_FIXTURES.filter(
    (fixture) => classification[fixture] === "above",
  );

  if (affectedFixtures.length === 0) {
    const hasBelowRangeFixture = WATER_TEMPERATURE_FIXTURES.some(
      (fixture) => classification[fixture] === "below",
    );
    return hasBelowRangeFixture ? "complete_with_attention" : "complete";
  }

  if (!args.hasAction) return "action_required";

  const activeRechecks = args.rechecks.filter(
    (recheck) => !recheck.supersededAt && !recheck.voidedAt,
  );

  const latestByFixture = new Map<
    WaterTemperatureFixture,
    WaterTemperatureRecheckFact
  >();
  for (const recheck of activeRechecks) {
    const existing = latestByFixture.get(recheck.fixture);
    if (!existing || recheck.sequence > existing.sequence) {
      latestByFixture.set(recheck.fixture, recheck);
    }
  }

  const allAffectedFixturesResolved = affectedFixtures.every((fixture) => {
    const latest = latestByFixture.get(fixture);
    return (
      latest !== undefined && classifyFixtureReading(latest.tempTenths) === "safe"
    );
  });

  return allAffectedFixturesResolved ? "complete" : "recheck_required";
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
