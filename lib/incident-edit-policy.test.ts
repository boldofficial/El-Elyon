import assert from "node:assert/strict";
import test from "node:test";

import {
  INCIDENT_EDIT_WINDOW_MS,
  canEditIncidentReport,
} from "./incident-edit-policy";

const AUTHOR = "user_author";
const SOMEONE_ELSE = "user_other";
const FILED_AT = new Date(Date.UTC(2026, 8, 16, 14, 0)); // 2026-09-16 14:00Z

const report = {reportedBy: AUTHOR, createdAt: FILED_AT};

test("the author may edit immediately after filing", () => {
  assert.equal(canEditIncidentReport(report, AUTHOR, FILED_AT), true);
});

test("the author may still edit one minute before the window closes", () => {
  const now = new Date(FILED_AT.getTime() + INCIDENT_EDIT_WINDOW_MS - 60_000);
  assert.equal(canEditIncidentReport(report, AUTHOR, now), true);
});

test("the author may not edit once the window has closed", () => {
  const now = new Date(FILED_AT.getTime() + INCIDENT_EDIT_WINDOW_MS);
  assert.equal(canEditIncidentReport(report, AUTHOR, now), false);
});

test("a different staff member may never edit, even inside the window", () => {
  assert.equal(canEditIncidentReport(report, SOMEONE_ELSE, FILED_AT), false);
});

test("createdAt arriving as an ISO string (from JSON) is handled", () => {
  const fromApi = {reportedBy: AUTHOR, createdAt: FILED_AT.toISOString()};
  assert.equal(canEditIncidentReport(fromApi, AUTHOR, FILED_AT), true);
});

test("a report with no createdAt is not editable", () => {
  assert.equal(
    canEditIncidentReport({reportedBy: AUTHOR, createdAt: null}, AUTHOR, FILED_AT),
    false,
  );
});
