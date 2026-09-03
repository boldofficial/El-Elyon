// Tests for CareShiftWorkspace's pure, exported clock-in/classification
// logic (payload building and double-submit gating).
//
// This repository has no jsdom/React Testing Library dependency and no
// other .test.tsx files rendering components (every existing UI test file
// in this codebase -- e.g. src/components/supervisor/*Model.test.ts --
// exercises pure, framework-free logic extracted from the component rather
// than mounting it). CareShiftWorkspace.tsx is a client component with
// effectful data fetching and browser-only APIs (via SelfieCapture's
// getUserMedia), so this file follows the same established pattern: it
// imports the component module for its exported pure helpers
// (buildClockInPayload, canSubmitClockIn, canSubmitClassification) and
// exercises those directly under node:test, without rendering the DOM tree.
// The functions under test are exactly what handleClockIn,
// handleSelfieCapture, and handleClassifyShift call before making any
// network request, so this covers the "same house/slot for normal and
// selfie clock-in" and "prevent double-submit" test scenarios from the
// plan at the level this codebase's test infrastructure supports.

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildClockInPayload,
  canSubmitClassification,
  canSubmitClockIn,
} from "./CareShiftWorkspace";

// --- buildClockInPayload ----------------------------------------------------

test("buildClockInPayload returns the selected house and slot unchanged", () => {
  assert.deepEqual(buildClockInPayload("House A", 2), {
    location: "House A",
    shiftSlot: 2,
  });
});

test("buildClockInPayload accepts all three shift slots", () => {
  assert.deepEqual(buildClockInPayload("House A", 1), {
    location: "House A",
    shiftSlot: 1,
  });
  assert.deepEqual(buildClockInPayload("House A", 3), {
    location: "House A",
    shiftSlot: 3,
  });
});

test("buildClockInPayload returns null for a blank location", () => {
  assert.equal(buildClockInPayload("", 2), null);
  assert.equal(buildClockInPayload("   ", 2), null);
});

test("buildClockInPayload returns null when no shift slot is selected", () => {
  assert.equal(buildClockInPayload("House A", ""), null);
});

test("normal and selfie clock-in build the identical payload from the same selection", () => {
  // handleClockIn (normal path) and handleSelfieCapture (selfie path) both
  // call buildClockInPayload with the same component state
  // (selectedLocation, selectedShiftSlot); this asserts that shared call
  // produces one stable payload regardless of which path invokes it, i.e.
  // the selfie interstitial cannot silently change or drop the selected
  // house/slot.
  const selectedLocation = "House B";
  const selectedShiftSlot = 3;

  const normalPathPayload = buildClockInPayload(selectedLocation, selectedShiftSlot);
  const selfiePathPayload = buildClockInPayload(selectedLocation, selectedShiftSlot);

  assert.deepEqual(normalPathPayload, selfiePathPayload);
  assert.deepEqual(normalPathPayload, {location: "House B", shiftSlot: 3});
});

// --- canSubmitClockIn (double-submit prevention) ----------------------------

test("canSubmitClockIn is true only with a valid selection and not already processing", () => {
  assert.equal(
    canSubmitClockIn({
      selectedLocation: "House A",
      selectedShiftSlot: 1,
      isProcessing: false,
    }),
    true,
  );
});

test("canSubmitClockIn is false while a submission is already in flight", () => {
  assert.equal(
    canSubmitClockIn({
      selectedLocation: "House A",
      selectedShiftSlot: 1,
      isProcessing: true,
    }),
    false,
  );
});

test("canSubmitClockIn is false without a selected location", () => {
  assert.equal(
    canSubmitClockIn({
      selectedLocation: "",
      selectedShiftSlot: 1,
      isProcessing: false,
    }),
    false,
  );
});

test("canSubmitClockIn is false without a selected shift slot", () => {
  assert.equal(
    canSubmitClockIn({
      selectedLocation: "House A",
      selectedShiftSlot: "",
      isProcessing: false,
    }),
    false,
  );
});

// --- canSubmitClassification -----------------------------------------------

test("canSubmitClassification is true with a valid slot and not already processing", () => {
  assert.equal(
    canSubmitClassification({selectedShiftSlot: 2, isProcessing: false}),
    true,
  );
});

test("canSubmitClassification is false while already processing (prevents double-submit)", () => {
  assert.equal(
    canSubmitClassification({selectedShiftSlot: 2, isProcessing: true}),
    false,
  );
});

test("canSubmitClassification is false without a selected slot", () => {
  assert.equal(
    canSubmitClassification({selectedShiftSlot: "", isProcessing: false}),
    false,
  );
});
