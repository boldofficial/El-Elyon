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

export const FIRE_DRILL_PARTICIPANT_SOURCES = [
  "roster",
  "manual",
  "external",
] as const;

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
    sequence: z.union([z.literal(1), z.literal(2)]),
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
