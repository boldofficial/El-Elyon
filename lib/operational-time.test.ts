import assert from "node:assert/strict";
import test from "node:test";

import {
  InvalidOperationalTimeZoneError,
  computeOperationalDate,
} from "./operational-time";

const CHICAGO = "America/Chicago";

// --- Ordinary UTC-boundary crossing ---------------------------------------

test("computeOperationalDate uses the organization-local calendar date, not the UTC date", () => {
  // 2026-01-15 23:30 CST (UTC-6) == 2026-01-16 05:30 UTC. If this fell back
  // to a UTC-based date, it would incorrectly report 2026-01-16.
  const instant = new Date(Date.UTC(2026, 0, 16, 5, 30));
  assert.equal(computeOperationalDate(instant, CHICAGO), "2026-01-15");
});

test("computeOperationalDate keeps an early-morning instant on the following local day", () => {
  // 2026-01-16 00:30 CST (UTC-6) == 2026-01-16 06:30 UTC.
  const instant = new Date(Date.UTC(2026, 0, 16, 6, 30));
  assert.equal(computeOperationalDate(instant, CHICAGO), "2026-01-16");
});

// --- Overnight 3rd-shift identity ------------------------------------------

test("an 11:30 PM 3rd-shift clock-in retains its start date after midnight", () => {
  // 2026-06-10 23:30 CDT (UTC-5) == 2026-06-11 04:30 UTC, well after
  // midnight UTC, but still 2026-06-10 in the organization's local time.
  const clockIn = new Date(Date.UTC(2026, 5, 11, 4, 30));
  assert.equal(computeOperationalDate(clockIn, CHICAGO), "2026-06-10");
});

// --- Daylight-saving transitions -------------------------------------------

test("an 11:30 PM 3rd-shift clock-in retains its start date across the spring-forward transition", () => {
  // Clocks in America/Chicago spring forward from CST to CDT at 2:00 AM on
  // 2026-03-08 (2nd Sunday of March). 2026-03-07 23:30 CST (UTC-6) ==
  // 2026-03-08 05:30 UTC.
  const clockIn = new Date(Date.UTC(2026, 2, 8, 5, 30));
  assert.equal(computeOperationalDate(clockIn, CHICAGO), "2026-03-07");
});

test("an 11:30 PM 3rd-shift clock-in retains its start date across the fall-back transition", () => {
  // Clocks in America/Chicago fall back from CDT to CST at 2:00 AM on
  // 2026-11-01 (1st Sunday of November). 2026-10-31 23:30 CDT (UTC-5) ==
  // 2026-11-01 04:30 UTC.
  const clockIn = new Date(Date.UTC(2026, 10, 1, 4, 30));
  assert.equal(computeOperationalDate(clockIn, CHICAGO), "2026-10-31");
});

test("computeOperationalDate is consistent for instants just before and after a DST transition", () => {
  // 2026-11-01 01:30 CDT (UTC-5, the last CDT hour before fall-back) ==
  // 2026-11-01 06:30 UTC, still 2026-11-01 local.
  const beforeFallBack = new Date(Date.UTC(2026, 10, 1, 6, 30));
  assert.equal(computeOperationalDate(beforeFallBack, CHICAGO), "2026-11-01");

  // 2026-11-01 01:30 CST (UTC-6, the repeated hour after fall-back) ==
  // 2026-11-01 07:30 UTC, still 2026-11-01 local.
  const afterFallBack = new Date(Date.UTC(2026, 10, 1, 7, 30));
  assert.equal(computeOperationalDate(afterFallBack, CHICAGO), "2026-11-01");
});

// --- Other IANA timezones ---------------------------------------------------

test("computeOperationalDate honors a non-Chicago IANA timezone", () => {
  // 2026-07-04 23:30 in America/New_York (UTC-4 during EDT) ==
  // 2026-07-05 03:30 UTC.
  const instant = new Date(Date.UTC(2026, 6, 5, 3, 30));
  assert.equal(
    computeOperationalDate(instant, "America/New_York"),
    "2026-07-04",
  );
});

// --- Invalid/missing timezone fails visibly ---------------------------------

test("computeOperationalDate throws InvalidOperationalTimeZoneError for an unrecognized timezone", () => {
  assert.throws(
    () => computeOperationalDate(new Date(), "Not/AZone"),
    InvalidOperationalTimeZoneError,
  );
});

test("computeOperationalDate throws InvalidOperationalTimeZoneError for a blank timezone", () => {
  assert.throws(
    () => computeOperationalDate(new Date(), ""),
    InvalidOperationalTimeZoneError,
  );
  assert.throws(
    () => computeOperationalDate(new Date(), "   "),
    InvalidOperationalTimeZoneError,
  );
});

test("computeOperationalDate throws InvalidOperationalTimeZoneError for a non-string/null/undefined timezone", () => {
  assert.throws(() =>
    computeOperationalDate(new Date(), undefined as unknown as string),
  );
  assert.throws(() =>
    computeOperationalDate(new Date(), null as unknown as string),
  );
  assert.throws(() =>
    computeOperationalDate(new Date(), 123 as unknown as string),
  );
});

test("computeOperationalDate throws InvalidOperationalTimeZoneError for an invalid instant", () => {
  assert.throws(() =>
    computeOperationalDate(new Date(Number.NaN), CHICAGO),
  );
});
