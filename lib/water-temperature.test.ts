import assert from "node:assert/strict";
import test from "node:test";

import {
  FORM_GUIDANCE_MAX_TENTHS,
  MAX_ACTION_LENGTH,
  SAFE_MAX_TENTHS,
  SAFE_MIN_TENTHS,
  classifyFixtureReading,
  deriveWaterTemperatureState,
  fahrenheitReadingSchema,
  isAboveFormGuidance,
  isValidIanaTimeZone,
  nextRecheckSequence,
  operationalDateSchema,
  organizationTimeZoneSchema,
  shiftSlotSchema,
  tenthsToFahrenheit,
  toFahrenheitTenths,
  waterTemperatureActionInputSchema,
  waterTemperatureCheckInputSchema,
  waterTemperatureRecheckInputSchema,
  waterTemperatureRecheckSupersedeInputSchema,
  waterTemperatureVoidInputSchema,
  type WaterTemperatureRecheckFact,
} from "./water-temperature";

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const SHIFT_ID = "22222222-2222-4222-8222-222222222222";

function checkInput(overrides: Record<string, unknown> = {}) {
  return {
    locationId: LOCATION_ID,
    shiftId: SHIFT_ID,
    shiftSlot: 2,
    operationalDate: "2026-03-04",
    kitchenTempF: 112.0,
    bathTempF: 114.0,
    staffId: "staff-1",
    staffName: "Jordan Ellis",
    staffInitials: "JE",
    observedAt: "2026-03-04T08:00:00.000Z",
    comments: null,
    ...overrides,
  };
}

// --- Fahrenheit <-> tenths conversion -------------------------------------

test("toFahrenheitTenths accepts safe, below-range, and above-range readings without rejecting them for being unsafe", () => {
  assert.equal(toFahrenheitTenths(112), 1120);
  assert.equal(toFahrenheitTenths(108.0), 1080);
  assert.equal(toFahrenheitTenths(118.0), 1180);
  assert.equal(toFahrenheitTenths(0), 0);
  assert.equal(toFahrenheitTenths(250), 2500);
});

test("toFahrenheitTenths rejects nonnumeric/impossible temperatures", () => {
  assert.equal(toFahrenheitTenths(Number.NaN), null);
  assert.equal(toFahrenheitTenths(Number.POSITIVE_INFINITY), null);
  assert.equal(toFahrenheitTenths(-1), null);
  assert.equal(toFahrenheitTenths(250.1), null);
  assert.equal(toFahrenheitTenths(1000), null);
});

test("toFahrenheitTenths rejects more than one decimal place without false negatives from binary rounding", () => {
  // 114.9 is not exactly representable in binary but must still be accepted.
  assert.equal(toFahrenheitTenths(114.9), 1149);
  // Genuine extra precision must be rejected.
  assert.equal(toFahrenheitTenths(114.87), null);
  assert.equal(toFahrenheitTenths(114.01), null);
});

test("tenthsToFahrenheit is the inverse of toFahrenheitTenths for display", () => {
  assert.equal(tenthsToFahrenheit(1180), 118);
  assert.equal(tenthsToFahrenheit(1149), 114.9);
});

// --- Fixture classification -------------------------------------------------

test("classifyFixtureReading treats both range bounds as inclusive", () => {
  assert.equal(classifyFixtureReading(SAFE_MIN_TENTHS), "safe");
  assert.equal(classifyFixtureReading(SAFE_MAX_TENTHS), "safe");
  assert.equal(classifyFixtureReading(SAFE_MIN_TENTHS - 1), "below");
  assert.equal(classifyFixtureReading(SAFE_MAX_TENTHS + 1), "above");
  assert.equal(classifyFixtureReading(1080), "below");
});

// The configured thresholds, pinned. Everything above asserts behaviour
// relative to the constants, so this is the one test that fails if the
// flagging policy itself is changed -- which is the point: moving a
// life-safety threshold should require deliberately editing an assertion
// that names the number, not just quietly recolouring the suite.
test("the configured flagging range is 110.0F-121.0F inclusive", () => {
  assert.equal(SAFE_MIN_TENTHS, 1100);
  assert.equal(SAFE_MAX_TENTHS, 1210);
  // 118.0F sits inside the flagging range even though the printed paper
  // form still calls it unsafe. That divergence is intentional; see
  // SAFE_MAX_TENTHS in lib/water-temperature.ts.
  assert.equal(classifyFixtureReading(1180), "safe");
  assert.equal(classifyFixtureReading(1211), "above");
});

// --- State derivation --------------------------------------------------------

// Threshold-relative fixtures. These track SAFE_MAX_TENTHS so a future
// threshold move cannot silently turn an "unsafe" fixture into a safe one and
// leave these tests quietly asserting the wrong workflow.
const UNSAFE_TENTHS = SAFE_MAX_TENTHS + 40; // 125.0F at a 121.0F ceiling
const UNSAFE_TENTHS_HIGHER = SAFE_MAX_TENTHS + 50; // 126.0F
const UNSAFE_RECHECK_TENTHS = SAFE_MAX_TENTHS + 20; // 123.0F
const SAFE_RECHECK_TENTHS = SAFE_MAX_TENTHS - 70; // 114.0F

function recheck(
  overrides: Partial<WaterTemperatureRecheckFact>,
): WaterTemperatureRecheckFact {
  return {
    fixture: "kitchen",
    tempTenths: 1120,
    sequence: 1,
    supersededAt: null,
    voidedAt: null,
    ...overrides,
  };
}

test("a normal 112/114 submission derives complete", () => {
  const state = deriveWaterTemperatureState({
    kitchenTempTenths: 1120,
    bathTempTenths: 1140,
    hasAction: false,
    rechecks: [],
  });
  assert.equal(state, "complete");
});

test("a below-range 108/112 submission derives complete_with_attention, not the above-range workflow", () => {
  const state = deriveWaterTemperatureState({
    kitchenTempTenths: 1080,
    bathTempTenths: 1120,
    hasAction: false,
    rechecks: [],
  });
  assert.equal(state, "complete_with_attention");
});

test("an above-range kitchen reading requires action before any recheck can resolve it", () => {
  const withoutAction = deriveWaterTemperatureState({
    kitchenTempTenths: UNSAFE_TENTHS,
    bathTempTenths: 1130,
    hasAction: false,
    rechecks: [],
  });
  assert.equal(withoutAction, "action_required");

  const withActionNoRecheck = deriveWaterTemperatureState({
    kitchenTempTenths: UNSAFE_TENTHS,
    bathTempTenths: 1130,
    hasAction: true,
    rechecks: [],
  });
  assert.equal(withActionNoRecheck, "recheck_required");
});

test("an unsafe kitchen recheck remains pending; a later safe recheck completes without losing the original reading", () => {
  const stillUnsafe = deriveWaterTemperatureState({
    kitchenTempTenths: UNSAFE_TENTHS,
    bathTempTenths: 1130,
    hasAction: true,
    rechecks: [recheck({ tempTenths: UNSAFE_RECHECK_TENTHS, sequence: 1 })],
  });
  assert.equal(stillUnsafe, "recheck_required");

  const resolved = deriveWaterTemperatureState({
    kitchenTempTenths: UNSAFE_TENTHS,
    bathTempTenths: 1130,
    hasAction: true,
    rechecks: [
      recheck({ tempTenths: UNSAFE_RECHECK_TENTHS, sequence: 1 }),
      recheck({ tempTenths: SAFE_RECHECK_TENTHS, sequence: 2 }),
    ],
  });
  assert.equal(resolved, "complete");
  // The original unsafe reading is a separate, immutable field on the header
  // and is never mutated by state derivation.
});

test("when both fixtures are above range, a safe recheck for only one does not complete the slot", () => {
  const bothAffected = deriveWaterTemperatureState({
    kitchenTempTenths: UNSAFE_TENTHS,
    bathTempTenths: UNSAFE_TENTHS_HIGHER,
    hasAction: true,
    rechecks: [
      recheck({ fixture: "kitchen", tempTenths: SAFE_RECHECK_TENTHS, sequence: 1 }),
    ],
  });
  assert.equal(bothAffected, "recheck_required");

  const bothResolved = deriveWaterTemperatureState({
    kitchenTempTenths: UNSAFE_TENTHS,
    bathTempTenths: UNSAFE_TENTHS_HIGHER,
    hasAction: true,
    rechecks: [
      recheck({ fixture: "kitchen", tempTenths: SAFE_RECHECK_TENTHS, sequence: 1 }),
      recheck({ fixture: "bath_shower", tempTenths: 1130, sequence: 1 }),
    ],
  });
  assert.equal(bothResolved, "complete");
});

test("a reading in the form-guidance band completes and raises no corrective workflow", () => {
  // The band the threshold change created: the posted paper form calls 118.0F
  // unsafe, this system does not flag it. The advisory shown to staff is
  // presentation-only and must never reach the state machine, so this has to
  // complete outright -- not complete_with_attention, and certainly not
  // action_required.
  const state = deriveWaterTemperatureState({
    kitchenTempTenths: 1180,
    bathTempTenths: 1130,
    hasAction: false,
    rechecks: [],
  });
  assert.equal(state, "complete");

  // isAboveFormGuidance never overlaps what the system flags, in either
  // direction -- that non-overlap is what keeps the advisory unable to soften
  // a real obligation.
  assert.equal(isAboveFormGuidance(SAFE_MAX_TENTHS), true);
  assert.equal(isAboveFormGuidance(SAFE_MAX_TENTHS + 1), false);
  assert.equal(isAboveFormGuidance(FORM_GUIDANCE_MAX_TENTHS), false);
  assert.equal(isAboveFormGuidance(FORM_GUIDANCE_MAX_TENTHS + 1), true);
  assert.equal(isAboveFormGuidance(SAFE_MIN_TENTHS - 1), false);
  assert.equal(classifyFixtureReading(1180), "safe");
});

test("a superseded mistyped recheck is ignored; state derives from the latest active ordered recheck", () => {
  const mistyped = recheck({ tempTenths: 1300, sequence: 1 }); // e.g. fat-fingered
  const corrected = recheck({ tempTenths: SAFE_RECHECK_TENTHS, sequence: 2 });

  const withMistypeActive = deriveWaterTemperatureState({
    kitchenTempTenths: UNSAFE_TENTHS,
    bathTempTenths: 1130,
    hasAction: true,
    rechecks: [mistyped],
  });
  assert.equal(withMistypeActive, "recheck_required");

  const withMistypeSuperseded = deriveWaterTemperatureState({
    kitchenTempTenths: UNSAFE_TENTHS,
    bathTempTenths: 1130,
    hasAction: true,
    rechecks: [
      { ...mistyped, supersededAt: "2026-03-04T09:00:00.000Z" },
      corrected,
    ],
  });
  assert.equal(withMistypeSuperseded, "complete");
});

test("a later active unsafe recheck reopens a previously-resolved fixture", () => {
  const state = deriveWaterTemperatureState({
    kitchenTempTenths: UNSAFE_TENTHS,
    bathTempTenths: 1130,
    hasAction: true,
    rechecks: [
      recheck({ tempTenths: SAFE_RECHECK_TENTHS, sequence: 1 }),
      recheck({ tempTenths: UNSAFE_RECHECK_TENTHS, sequence: 2 }),
    ],
  });
  assert.equal(state, "recheck_required");
});

test("nextRecheckSequence is deterministic and append-only", () => {
  assert.equal(nextRecheckSequence([]), 1);
  assert.equal(nextRecheckSequence([1]), 2);
  assert.equal(nextRecheckSequence([1, 2, 4]), 5);
});

// --- IANA timezone validation -------------------------------------------------

test("isValidIanaTimeZone accepts recognized identifiers and rejects garbage", () => {
  assert.equal(isValidIanaTimeZone("America/Chicago"), true);
  assert.equal(isValidIanaTimeZone("UTC"), true);
  assert.equal(isValidIanaTimeZone(""), false);
  assert.equal(isValidIanaTimeZone("Not/AZone"), false);
  assert.equal(isValidIanaTimeZone("   "), false);
});

test("organizationTimeZoneSchema mirrors isValidIanaTimeZone", () => {
  assert.equal(
    organizationTimeZoneSchema.safeParse("America/Chicago").success,
    true,
  );
  assert.equal(organizationTimeZoneSchema.safeParse("Nowhere/Fake").success, false);
  assert.equal(organizationTimeZoneSchema.safeParse("").success, false);
});

// --- Local date / slot schemas ------------------------------------------------

test("operationalDateSchema rejects malformed and nonexistent calendar dates", () => {
  assert.equal(operationalDateSchema.safeParse("2026-03-04").success, true);
  assert.equal(operationalDateSchema.safeParse("2026-13-01").success, false);
  assert.equal(operationalDateSchema.safeParse("2026-02-30").success, false);
  assert.equal(operationalDateSchema.safeParse("03/04/2026").success, false);
});

test("shiftSlotSchema only accepts 1, 2, or 3", () => {
  for (const slot of [1, 2, 3]) {
    assert.equal(shiftSlotSchema.safeParse(slot).success, true);
  }
  for (const slot of [0, 4, -1, 1.5, "1"]) {
    assert.equal(shiftSlotSchema.safeParse(slot).success, false);
  }
});

// --- fahrenheitReadingSchema ---------------------------------------------------

test("fahrenheitReadingSchema accepts 108.0 and 118.0 as valid (unsafe but valid) readings", () => {
  const below = fahrenheitReadingSchema.safeParse(108.0);
  const above = fahrenheitReadingSchema.safeParse(118.0);
  assert.equal(below.success, true);
  assert.equal(above.success, true);
  if (below.success) assert.equal(below.data, 1080);
  if (above.success) assert.equal(above.data, 1180);
});

test("fahrenheitReadingSchema rejects out-of-range and over-precise values", () => {
  assert.equal(fahrenheitReadingSchema.safeParse(-5).success, false);
  assert.equal(fahrenheitReadingSchema.safeParse(999).success, false);
  assert.equal(fahrenheitReadingSchema.safeParse(114.87).success, false);
  assert.equal(fahrenheitReadingSchema.safeParse(Number.NaN).success, false);
});

// --- waterTemperatureCheckInputSchema ------------------------------------------

test("waterTemperatureCheckInputSchema accepts a well-formed submission including unsafe values", () => {
  const parsed = waterTemperatureCheckInputSchema.safeParse(
    checkInput({ kitchenTempF: 118.0, bathTempF: 108.0 }),
  );
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.kitchenTempF, 1180);
    assert.equal(parsed.data.bathTempF, 1080);
  }
});

test("waterTemperatureCheckInputSchema rejects invalid slots", () => {
  for (const shiftSlot of [0, 4, -1]) {
    assert.equal(
      waterTemperatureCheckInputSchema.safeParse(checkInput({ shiftSlot }))
        .success,
      false,
    );
  }
});

test("waterTemperatureCheckInputSchema rejects nonnumeric/impossible temperatures", () => {
  assert.equal(
    waterTemperatureCheckInputSchema.safeParse(
      checkInput({ kitchenTempF: "112" as unknown as number }),
    ).success,
    false,
  );
  assert.equal(
    waterTemperatureCheckInputSchema.safeParse(checkInput({ bathTempF: 999 }))
      .success,
    false,
  );
});

test("waterTemperatureCheckInputSchema rejects incomplete staff snapshots", () => {
  assert.equal(
    waterTemperatureCheckInputSchema.safeParse(checkInput({ staffName: "" }))
      .success,
    false,
  );
  assert.equal(
    waterTemperatureCheckInputSchema.safeParse(
      checkInput({ staffInitials: "   " }),
    ).success,
    false,
  );
  assert.equal(
    waterTemperatureCheckInputSchema.safeParse(checkInput({ staffId: "" }))
      .success,
    false,
  );
});

test("waterTemperatureCheckInputSchema rejects unknown fields", () => {
  assert.equal(
    waterTemperatureCheckInputSchema.safeParse(
      checkInput({ extraField: "not allowed" }),
    ).success,
    false,
  );
});

// --- action / recheck / supersede / void input schemas -------------------------

test("waterTemperatureActionInputSchema requires nonempty action text within bounds", () => {
  assert.equal(
    waterTemperatureActionInputSchema.safeParse({
      expectedVersion: 1,
      action: "Restricted resident use of shower; notified maintenance.",
      staffId: "staff-1",
      staffName: "Jordan Ellis",
      staffInitials: "JE",
    }).success,
    true,
  );
  assert.equal(
    waterTemperatureActionInputSchema.safeParse({
      expectedVersion: 1,
      action: "",
      staffId: "staff-1",
      staffName: "Jordan Ellis",
      staffInitials: "JE",
    }).success,
    false,
  );
  assert.equal(
    waterTemperatureActionInputSchema.safeParse({
      expectedVersion: 1,
      action: "x".repeat(MAX_ACTION_LENGTH + 1),
      staffId: "staff-1",
      staffName: "Jordan Ellis",
      staffInitials: "JE",
    }).success,
    false,
  );
});

test("waterTemperatureRecheckInputSchema accepts a safe recheck and rejects an invalid fixture", () => {
  assert.equal(
    waterTemperatureRecheckInputSchema.safeParse({
      expectedVersion: 2,
      fixture: "kitchen",
      tempF: 114.0,
      staffId: "staff-2",
      staffName: "Replacement Worker",
      staffInitials: "RW",
      measuredAt: "2026-03-04T09:15:00.000Z",
    }).success,
    true,
  );
  assert.equal(
    waterTemperatureRecheckInputSchema.safeParse({
      expectedVersion: 2,
      fixture: "sink",
      tempF: 114.0,
      staffId: "staff-2",
      staffName: "Replacement Worker",
      staffInitials: "RW",
      measuredAt: "2026-03-04T09:15:00.000Z",
    }).success,
    false,
  );
});

test("waterTemperatureRecheckSupersedeInputSchema requires a reason", () => {
  assert.equal(
    waterTemperatureRecheckSupersedeInputSchema.safeParse({
      reason: "Entered wrong fixture reading by mistake",
    }).success,
    true,
  );
  assert.equal(
    waterTemperatureRecheckSupersedeInputSchema.safeParse({ reason: "" })
      .success,
    false,
  );
});

test("waterTemperatureVoidInputSchema requires an expected version and a reason", () => {
  assert.equal(
    waterTemperatureVoidInputSchema.safeParse({
      expectedVersion: 1,
      reason: "Entered under the wrong house by accident",
    }).success,
    true,
  );
  assert.equal(
    waterTemperatureVoidInputSchema.safeParse({
      expectedVersion: 0,
      reason: "Entered under the wrong house by accident",
    }).success,
    false,
  );
  assert.equal(
    waterTemperatureVoidInputSchema.safeParse({
      expectedVersion: 1,
      reason: "",
    }).success,
    false,
  );
});
