import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_FIRE_DRILL_DURATION_MINUTES,
  fireDrillParticipantInputSchema,
  fireDrillReportInputSchema,
  isValidLocalDate,
  lifeSafetyInspectionInputSchema,
  lifeSafetyVoidInputSchema,
} from "./life-safety-reporting";

const LOCATION_ID = "11111111-1111-4111-8111-111111111111";
const RESIDENT_ID = "22222222-2222-4222-8222-222222222222";

function inspection(
  equipmentType: "smoke" | "carbon_monoxide" | "fire_extinguisher",
) {
  return {
    locationId: LOCATION_ID,
    reportYear: 2026,
    reportMonth: 1,
    equipmentType,
    inspectionDate: "2026-01-15",
    staffInitials: "MP",
    outcome: "pass" as const,
    notes: null,
  };
}

function participant(overrides: Record<string, unknown> = {}) {
  return {
    residentId: RESIDENT_ID,
    residentNameSnapshot: "Resident One",
    participantSource: "roster",
    durationMinutes: 0,
    durationSeconds: 42,
    comment: null,
    position: 0,
    ...overrides,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  return {
    locationId: LOCATION_ID,
    reportYear: 2026,
    sequence: 1,
    drillDate: "2026-03-04",
    drillTime: "14:05",
    staffNames: ["Staff One", "Staff Two"],
    participants: [participant()],
    ...overrides,
  };
}

test("accepts independent smoke, CO, and extinguisher entries for one month", () => {
  for (const equipmentType of [
    "smoke",
    "carbon_monoxide",
    "fire_extinguisher",
  ] as const) {
    assert.equal(
      lifeSafetyInspectionInputSchema.parse(inspection(equipmentType))
        .equipmentType,
      equipmentType,
    );
  }
});

test("inspection dates must be real and match their report identity", () => {
  assert.equal(isValidLocalDate("2024-02-29"), true);
  assert.equal(isValidLocalDate("2025-02-29"), false);

  for (const candidate of [
    { ...inspection("smoke"), inspectionDate: "2026-02-01" },
    { ...inspection("smoke"), inspectionDate: "2025-01-01" },
    { ...inspection("smoke"), inspectionDate: "2026-02-30" },
  ]) {
    assert.equal(
      lifeSafetyInspectionInputSchema.safeParse(candidate).success,
      false,
    );
  }
});

test("inspection input rejects unsupported outcomes and unknown properties", () => {
  assert.equal(
    lifeSafetyInspectionInputSchema.safeParse({
      ...inspection("smoke"),
      outcome: "not_checked",
    }).success,
    false,
  );
  assert.equal(
    lifeSafetyInspectionInputSchema.safeParse({
      ...inspection("smoke"),
      createdBy: "client-controlled",
    }).success,
    false,
  );
});

test("participant duration is an all-or-none pair with bounded seconds", () => {
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(participant()).success,
    true,
  );
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({ durationMinutes: MAX_FIRE_DRILL_DURATION_MINUTES }),
    ).success,
    true,
  );
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({ durationMinutes: MAX_FIRE_DRILL_DURATION_MINUTES + 1 }),
    ).success,
    false,
  );
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({ durationMinutes: 1, durationSeconds: null }),
    ).success,
    false,
  );
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({ durationMinutes: -1 }),
    ).success,
    false,
  );
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({ durationSeconds: 60 }),
    ).success,
    false,
  );
});

test("a missing gathering time requires an explanatory comment", () => {
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({
        durationMinutes: null,
        durationSeconds: null,
        comment: "Resident was away from the house.",
      }),
    ).success,
    true,
  );
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({
        durationMinutes: null,
        durationSeconds: null,
        comment: "   ",
      }),
    ).success,
    false,
  );
});

test("participant provenance agrees with the optional roster reference", () => {
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({ residentId: null, participantSource: "manual" }),
    ).success,
    true,
  );
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({ residentId: null, participantSource: "roster" }),
    ).success,
    false,
  );
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({ participantSource: "manual" }),
    ).success,
    false,
  );
});

test("external is not an accepted participant source", () => {
  // Fire drills record resident evacuation results only. Asserted with a null
  // residentId so this fails on the source enum itself, not on the
  // roster-reference refinement that would reject any source paired with an id.
  assert.equal(
    fireDrillParticipantInputSchema.safeParse(
      participant({ residentId: null, participantSource: "external" }),
    ).success,
    false,
  );
});

test("fire drill accepts local facts and rejects duplicate identities", () => {
  assert.equal(fireDrillReportInputSchema.safeParse(report()).success, true);
  assert.equal(
    fireDrillReportInputSchema.safeParse(
      report({ staffNames: ["Staff One", " staff one "] }),
    ).success,
    false,
  );
  assert.equal(
    fireDrillReportInputSchema.safeParse(
      report({ participants: [participant(), participant({ position: 0 })] }),
    ).success,
    false,
  );
  assert.equal(
    fireDrillReportInputSchema.safeParse(
      report({
        participants: [
          participant(),
          participant({
            position: 1,
            residentNameSnapshot: "Renamed snapshot",
          }),
        ],
      }),
    ).success,
    false,
  );
});

test("fire drill dates, times, sequence, and collection bounds are enforced", () => {
  for (const candidate of [
    report({ drillDate: "2025-12-31" }),
    report({ drillTime: "24:00" }),
    report({ sequence: 3 }),
    report({ staffNames: [] }),
    report({ participants: [] }),
  ]) {
    assert.equal(
      fireDrillReportInputSchema.safeParse(candidate).success,
      false,
    );
  }
});

test("void input requires a positive version and a bounded reason", () => {
  assert.deepEqual(
    lifeSafetyVoidInputSchema.parse({
      expectedVersion: 2,
      reason: "Duplicate entry",
    }),
    {
      expectedVersion: 2,
      reason: "Duplicate entry",
    },
  );
  assert.equal(
    lifeSafetyVoidInputSchema.safeParse({ expectedVersion: 0, reason: "No" })
      .success,
    false,
  );
  assert.equal(
    lifeSafetyVoidInputSchema.safeParse({ expectedVersion: 1, reason: "   " })
      .success,
    false,
  );
});
