import { z } from "zod";

export const LIFE_SAFETY_REPORT_YEAR_MIN = 2020;
export const LIFE_SAFETY_REPORT_YEAR_MAX = 2100;
export const MAX_FIRE_DRILL_STAFF = 24;
export const MAX_FIRE_DRILL_PARTICIPANTS = 64;
export const MAX_FIRE_DRILL_DURATION_MINUTES = 2_147_483_647;

export const LIFE_SAFETY_EQUIPMENT_TYPES = [
  "smoke",
  "carbon_monoxide",
  "fire_extinguisher",
] as const;

export const LIFE_SAFETY_OUTCOMES = ["pass", "fail"] as const;

// 'scheduled' is the semiannual pair (sequence 1 = semi-annual, 2 = annual).
// 'admission' is the placement drill owed to each newly admitted resident,
// identified by that resident rather than by a sequence slot.
export const FIRE_DRILL_TYPES = ["scheduled", "admission"] as const;

// Admission/placement drill sheet: "To be completed within 3 days after
// placement/admission."
export const ADMISSION_DRILL_DEADLINE_DAYS = 3;

// The day admission drills started being tracked in the system (PR #21
// merged). Residents placed before this were admitted under the paper
// process and owe nothing here; without the cutoff every existing resident
// showed as overdue the day the feature shipped.
export const ADMISSION_DRILL_TRACKING_START = "2026-09-11";

// Fire drills record resident evacuation results only, so there is no
// "external" (non-resident) source: the drill sheet has no column for one and
// no requirement asks for it. "manual" covers the real gap -- a resident who
// cannot be selected from the roster dropdown, such as a new admission not yet
// in the system or one since removed.
//
// The database CHECK constraint still permits 'external' (see db/schema.ts).
// That is deliberate: no row has ever used it, nothing can produce it now, and
// tightening it would require another migration for no behavioural gain.
export const FIRE_DRILL_PARTICIPANT_SOURCES = ["roster", "manual"] as const;

export const LIFE_SAFETY_REVISION_ACTIONS = [
  "create",
  "correct",
  "move",
  "void",
] as const;

export type LifeSafetyEquipmentType =
  (typeof LIFE_SAFETY_EQUIPMENT_TYPES)[number];
export type LifeSafetyOutcome = (typeof LIFE_SAFETY_OUTCOMES)[number];
export type FireDrillParticipantSource =
  (typeof FIRE_DRILL_PARTICIPANT_SOURCES)[number];
export type FireDrillType = (typeof FIRE_DRILL_TYPES)[number];
export type LifeSafetyRevisionAction =
  (typeof LIFE_SAFETY_REVISION_ACTIONS)[number];

const UUID_SCHEMA = z.string().uuid();
const REPORT_YEAR_SCHEMA = z
  .number()
  .int()
  .min(LIFE_SAFETY_REPORT_YEAR_MIN)
  .max(LIFE_SAFETY_REPORT_YEAR_MAX);
const LOCAL_DATE_SCHEMA = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a local date in YYYY-MM-DD format")
  .refine(isValidLocalDate, "Invalid local calendar date");
const LOCAL_TIME_SCHEMA = z
  .string()
  .regex(
    /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/,
    "Expected a local time in HH:mm or HH:mm:ss format",
  );

const boundedText = (label: string, maximum: number) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(maximum, `${label} must be ${maximum} characters or fewer`);

const optionalText = (maximum: number) =>
  z.string().trim().max(maximum).nullable().optional();

export const lifeSafetyInspectionInputSchema = z
  .object({
    locationId: UUID_SCHEMA,
    reportYear: REPORT_YEAR_SCHEMA,
    reportMonth: z.number().int().min(1).max(12),
    equipmentType: z.enum(LIFE_SAFETY_EQUIPMENT_TYPES),
    inspectionDate: LOCAL_DATE_SCHEMA,
    staffInitials: boundedText("Staff initials", 50),
    outcome: z.enum(LIFE_SAFETY_OUTCOMES),
    notes: optionalText(2000),
  })
  .strict()
  .superRefine((entry, context) => {
    const [year, month] = localDateParts(entry.inspectionDate);

    if (year !== entry.reportYear) {
      context.addIssue({
        code: "custom",
        message: "Inspection date must be in the reporting year",
        path: ["inspectionDate"],
      });
    }

    if (month !== entry.reportMonth) {
      context.addIssue({
        code: "custom",
        message: "Inspection date must be in the reporting month",
        path: ["inspectionDate"],
      });
    }
  });

export const fireDrillParticipantInputSchema = z
  .object({
    residentId: UUID_SCHEMA.nullable(),
    residentNameSnapshot: boundedText("Resident name", 255),
    participantSource: z.enum(FIRE_DRILL_PARTICIPANT_SOURCES),
    durationMinutes: z.number().int().min(0).max(MAX_FIRE_DRILL_DURATION_MINUTES).nullable(),
    durationSeconds: z.number().int().min(0).max(59).nullable(),
    comment: optionalText(2000),
    position: z
      .number()
      .int()
      .min(0)
      .max(MAX_FIRE_DRILL_PARTICIPANTS - 1),
  })
  .strict()
  .superRefine((participant, context) => {
    const isRosterParticipant = participant.participantSource === "roster";

    if (isRosterParticipant !== (participant.residentId !== null)) {
      context.addIssue({
        code: "custom",
        message:
          "Roster participants require a resident ID; manual and external participants must not include one",
        path: ["residentId"],
      });
    }

    const hasMinutes = participant.durationMinutes !== null;
    const hasSeconds = participant.durationSeconds !== null;
    if (hasMinutes !== hasSeconds) {
      context.addIssue({
        code: "custom",
        message: "Duration minutes and seconds must be supplied together",
        path: ["durationSeconds"],
      });
    }

    if (!hasMinutes && !hasMeaningfulText(participant.comment)) {
      context.addIssue({
        code: "custom",
        message: "A comment is required when no gathering time was recorded",
        path: ["comment"],
      });
    }
  });

export const fireDrillReportInputSchema = z
  .object({
    locationId: UUID_SCHEMA,
    reportYear: REPORT_YEAR_SCHEMA,
    // Defaults keep the pre-admission-drill request shape valid: a payload
    // that only carries `sequence` is a scheduled drill.
    drillType: z.enum(FIRE_DRILL_TYPES).default("scheduled"),
    sequence: z.union([z.literal(1), z.literal(2)]).nullable().default(null),
    admissionResidentId: UUID_SCHEMA.nullable().default(null),
    drillDate: LOCAL_DATE_SCHEMA,
    drillTime: LOCAL_TIME_SCHEMA,
    staffNames: z
      .array(boundedText("Staff name", 255))
      .min(1)
      .max(MAX_FIRE_DRILL_STAFF),
    participants: z
      .array(fireDrillParticipantInputSchema)
      .min(1)
      .max(MAX_FIRE_DRILL_PARTICIPANTS),
  })
  .strict()
  .superRefine((report, context) => {
    const [year] = localDateParts(report.drillDate);
    if (year !== report.reportYear) {
      context.addIssue({
        code: "custom",
        message: "Drill date must be in the reporting year",
        path: ["drillDate"],
      });
    }

    if (report.drillType === "scheduled") {
      if (report.sequence === null) {
        context.addIssue({
          code: "custom",
          message: "Scheduled drills require a sequence (1 = semi-annual, 2 = annual)",
          path: ["sequence"],
        });
      }
      if (report.admissionResidentId !== null) {
        context.addIssue({
          code: "custom",
          message: "Scheduled drills must not name an admission resident",
          path: ["admissionResidentId"],
        });
      }
    } else {
      if (report.sequence !== null) {
        context.addIssue({
          code: "custom",
          message: "Admission drills do not use a sequence slot",
          path: ["sequence"],
        });
      }
      if (report.admissionResidentId === null) {
        context.addIssue({
          code: "custom",
          message: "Admission drills require the newly placed resident",
          path: ["admissionResidentId"],
        });
      } else if (
        !report.participants.some(
          (participant) =>
            participant.participantSource === "roster" &&
            participant.residentId === report.admissionResidentId,
        )
      ) {
        // The drill exists for this resident; a sheet without their result
        // would not evidence the requirement.
        context.addIssue({
          code: "custom",
          message:
            "The newly placed resident must be recorded as a participant in their admission drill",
          path: ["participants"],
        });
      }
    }

    addDuplicateIssues(
      report.staffNames.map(normalizeComparableText),
      context,
      ["staffNames"],
      "Duplicate staff member",
    );

    addDuplicateIssues(
      report.participants.map((participant) => participant.position),
      context,
      ["participants"],
      "Duplicate participant position",
    );

    const residentIds = report.participants
      .map((participant) => participant.residentId)
      .filter((residentId): residentId is string => residentId !== null);
    addDuplicateIssues(
      residentIds,
      context,
      ["participants"],
      "Duplicate resident",
    );
  });

export const lifeSafetyExpectedVersionSchema = z.number().int().min(1);

export const lifeSafetyVoidInputSchema = z
  .object({
    expectedVersion: lifeSafetyExpectedVersionSchema,
    reason: boundedText("Void reason", 1000),
  })
  .strict();

export type LifeSafetyInspectionInput = z.infer<
  typeof lifeSafetyInspectionInputSchema
>;
export type FireDrillParticipantInput = z.infer<
  typeof fireDrillParticipantInputSchema
>;
export type FireDrillReportInput = z.infer<typeof fireDrillReportInputSchema>;
export type LifeSafetyVoidInput = z.infer<typeof lifeSafetyVoidInputSchema>;

export function selectFireDrillResidentNameSnapshot(args: {
	participant: Pick<
		FireDrillParticipantInput,
		'participantSource' | 'residentId' | 'residentNameSnapshot'
	>;
	snapshotByResidentId: ReadonlyMap<string, string>;
	rosterById: ReadonlyMap<string, string>;
}) {
	return args.participant.participantSource === 'roster'
		? args.snapshotByResidentId.get(args.participant.residentId as string) ??
			(args.rosterById.get(args.participant.residentId as string) as string)
		: args.participant.residentNameSnapshot;
}

// ---------------------------------------------------------------------------
// Admission drill deadline
// ---------------------------------------------------------------------------

export type AdmissionDrillState =
  | "not_started" // placement date is still in the future
  | "due" // inside the 3-day window, no drill yet
  | "overdue" // window passed, no drill yet
  | "completed" // drill held on time
  | "completed_late"; // drill held, but after the deadline

export interface AdmissionDrillEvaluation {
  /** Local date (YYYY-MM-DD) the countdown starts from. */
  anchorDate: string;
  /** Local date (YYYY-MM-DD) the drill must be held by. */
  deadline: string;
  /** Whole days until the deadline; negative once it has passed. */
  daysRemaining: number;
  state: AdmissionDrillState;
}

/**
 * The date the 3-day countdown starts from.
 *
 * Residents are created without a placement date (see createResidentWithAuth)
 * and it is filled in later on the profile screen, so `placementDate` alone
 * would leave most new admissions with no countdown at all. Fall back to the
 * row's creation date, which is the day the house knew about the resident.
 */
export function admissionDrillAnchorDate(resident: {
  placementDate: Date | string | null | undefined;
  createdAt: Date | string | null | undefined;
}): string | null {
  const source = resident.placementDate ?? resident.createdAt;
  if (!source) return null;
  return toLocalDate(source);
}

/** Whether a placement on `anchorDate` falls under the tracked requirement. */
export function isAdmissionDrillRequired(anchorDate: string): boolean {
  return anchorDate >= ADMISSION_DRILL_TRACKING_START;
}

export function admissionDrillDeadline(anchorDate: string): string {
  return addLocalDays(anchorDate, ADMISSION_DRILL_DEADLINE_DAYS);
}

/**
 * Decide where a resident stands on their admission drill.
 *
 * @param args.anchorDate  Local date the countdown starts from (placement).
 * @param args.drillDate   Local date of the resident's admission drill, or
 *                         null when none has been recorded (voided drills
 *                         must be filtered out by the caller).
 * @param args.today       Local date to evaluate against.
 */
export function evaluateAdmissionDrill(args: {
  anchorDate: string;
  drillDate: string | null;
  today: string;
}): AdmissionDrillEvaluation {
  const deadline = admissionDrillDeadline(args.anchorDate);
  const daysRemaining = differenceInLocalDays(args.today, deadline);

  // Local dates are YYYY-MM-DD strings, so string comparison is date order.
  // A drill dated before the placement belongs to an earlier stay and does
  // not count. A late drill is still recorded (and flagged) rather than
  // leaving the resident "overdue" forever. The deadline day itself is on time.
  const drillCounts = args.drillDate !== null && args.drillDate >= args.anchorDate;
  let state: AdmissionDrillState;
  if (drillCounts) {
    state = (args.drillDate as string) <= deadline ? "completed" : "completed_late";
  } else if (args.today < args.anchorDate) {
    state = "not_started";
  } else {
    state = daysRemaining >= 0 ? "due" : "overdue";
  }

  return { anchorDate: args.anchorDate, deadline, daysRemaining, state };
}

// ---------------------------------------------------------------------------
// Monthly smoke & CO detector check reminder
// ---------------------------------------------------------------------------

export const DETECTOR_CHECK_INTERVAL_DAYS = 30;
export const DETECTOR_CHECK_REMINDER_LEAD_DAYS = 7;

export type DetectorKind = "smoke" | "carbon_monoxide";

/** Display order, and the order `outstanding` is reported in. */
export const DETECTOR_KINDS: readonly DetectorKind[] = ["smoke", "carbon_monoxide"];

export interface DetectorCheckEvaluation {
  /** Most recent check per detector, from either record system; null if never. */
  lastChecked: Record<DetectorKind, string | null>;
  /** Local date each detector's next check is due by. */
  dueDate: Record<DetectorKind, string>;
  /** Detectors inside the reminder window or past due, in display order. */
  outstanding: DetectorKind[];
  /** Earliest due date among the outstanding detectors; null if none. */
  earliestDue: string | null;
  /** True when any outstanding detector is past its due date. */
  overdue: boolean;
}

/**
 * Decide whether a house needs its monthly smoke / CO detector reminder.
 *
 * Checks live in two places. The original `smoke_detector_checks` sheet
 * recorded smoke and CO together on one row; the v2 inspection sheet
 * (`life_safety_inspection_entries`) records them as separate rows. Every new
 * check goes to v2 -- nothing writes the legacy table any more -- but houses
 * whose last check predates v2 still only have a legacy row. So each detector
 * takes the more recent of its v2 date and the legacy date.
 *
 * Reading only the legacy table was the bug this exists to fix: a house could
 * record every monthly check on time and still be reminded daily, because
 * the reminder never saw a single one of them.
 *
 * The reminder clears only once BOTH detectors are current. The alert is
 * titled "Smoke & CO", and a house that checked its smoke alarms but not its
 * CO alarms has not done its monthly check. `outstanding` names which one is
 * holding it open, so the reminder can say so rather than look stuck.
 *
 * A failed inspection still counts as a check having been done. A detector
 * that fails needs repairing, which is a different problem from a check that
 * was never carried out, and keeping this reminder open would not signal it.
 *
 * @param args.legacyCheckDate  Local date of the latest legacy combined check.
 * @param args.latestSmokeDate  Local date of the latest non-voided v2 smoke row.
 * @param args.latestCoDate     Local date of the latest non-voided v2 CO row.
 * @param args.today            Local date to evaluate against.
 */
export function evaluateDetectorCheck(args: {
  legacyCheckDate: string | null;
  latestSmokeDate: string | null;
  latestCoDate: string | null;
  today: string;
}): DetectorCheckEvaluation {
  const latest = (a: string | null, b: string | null) =>
    a === null ? b : b === null ? a : a > b ? a : b;

  const lastChecked: Record<DetectorKind, string | null> = {
    smoke: latest(args.latestSmokeDate, args.legacyCheckDate),
    carbon_monoxide: latest(args.latestCoDate, args.legacyCheckDate),
  };

  // Never checked is treated as due today, not as exempt: the house has an
  // outstanding monthly check and the reminder should say so.
  const dueDate: Record<DetectorKind, string> = {
    smoke: lastChecked.smoke
      ? addLocalDays(lastChecked.smoke, DETECTOR_CHECK_INTERVAL_DAYS)
      : args.today,
    carbon_monoxide: lastChecked.carbon_monoxide
      ? addLocalDays(lastChecked.carbon_monoxide, DETECTOR_CHECK_INTERVAL_DAYS)
      : args.today,
  };

  const outstanding = DETECTOR_KINDS.filter(
    (kind) =>
      differenceInLocalDays(args.today, dueDate[kind]) <=
      DETECTOR_CHECK_REMINDER_LEAD_DAYS,
  );

  const earliestDue =
    outstanding.length === 0
      ? null
      : outstanding.map((kind) => dueDate[kind]).sort()[0];

  return {
    lastChecked,
    dueDate,
    outstanding,
    earliestDue,
    overdue: outstanding.some((kind) => args.today > dueDate[kind]),
  };
}

/** Local calendar date (YYYY-MM-DD) for a Date or ISO/local-date string. */
export function toLocalDate(value: Date | string): string {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function addLocalDays(localDate: string, days: number): string {
  const [year, month, day] = localDateParts(localDate);
  const shifted = new Date(Date.UTC(year, month - 1, day + days));
  return shifted.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function differenceInLocalDays(from: string, to: string): number {
  const [fy, fm, fd] = localDateParts(from);
  const [ty, tm, td] = localDateParts(to);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

export function isValidLocalDate(value: string): boolean {
  const [year, month, day] = localDateParts(value);
  if (!year || !month || !day) return false;

  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function localDateParts(value: string): [number, number, number] {
  const parts = value.split("-").map(Number);
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

function hasMeaningfulText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeComparableText(value: string): string {
  return value.trim().toLocaleLowerCase("en-US");
}

function addDuplicateIssues<T>(
  values: T[],
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string,
): void {
  const seen = new Set<T>();
  for (const value of values) {
    if (seen.has(value)) {
      context.addIssue({ code: "custom", message, path });
      return;
    }
    seen.add(value);
  }
}
