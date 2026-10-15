// lib/blood-glucose.ts
//
// Pure rules for the blood sugar (glucose) log: units, check types, the
// per-resident alert thresholds, reading classification and entry
// validation. Nothing here touches the database so the whole policy can be
// unit-tested, mirroring lib/carb-log.ts.

import type {LogSchedule, ScheduleSlot} from './custom-log-schedule';

// ── Units ────────────────────────────────────────────────────────────────

export const GLUCOSE_UNITS = ['mg_dl', 'mmol_l'] as const;
export type GlucoseUnit = (typeof GLUCOSE_UNITS)[number];

export const GLUCOSE_UNIT_LABELS: Record<GlucoseUnit, string> = {
	mg_dl: 'mg/dL',
	mmol_l: 'mmol/L',
};

/** mg/dL is the default; mmol/L is offered as the second option. */
export const DEFAULT_GLUCOSE_UNIT: GlucoseUnit = 'mg_dl';

/** Standard clinical conversion factor (glucose molar mass / 10, rounded). */
export const MG_DL_PER_MMOL_L = 18;

/** Accepted entry ranges. Meters usually read 20-600 mg/dL and show LO/HI outside that. */
export const READING_LIMITS: Record<GlucoseUnit, {min: number; max: number}> = {
	mg_dl: {min: 10, max: 999},
	mmol_l: {min: 0.6, max: 55.5},
};

export function isGlucoseUnit(value: unknown): value is GlucoseUnit {
	return typeof value === 'string' && (GLUCOSE_UNITS as readonly string[]).includes(value);
}

/** Canonical mg/dL (whole number) for a reading in either unit. */
export function toMgDl(value: number, unit: GlucoseUnit): number {
	return unit === 'mg_dl' ? Math.round(value) : Math.round(value * MG_DL_PER_MMOL_L);
}

/** mmol/L to one decimal, for showing a mg/dL figure in the other unit. */
export function mgDlToMmolL(mgDl: number): number {
	return Math.round((mgDl / MG_DL_PER_MMOL_L) * 10) / 10;
}

// ── Check types, methods, symptoms, actions ──────────────────────────────

export const CHECK_TYPES = [
	'fasting',
	'before_breakfast',
	'before_lunch',
	'before_dinner',
	'bedtime',
	'after_meal',
	'prn',
	'recheck',
] as const;
export type GlucoseCheckType = (typeof CHECK_TYPES)[number];

export const CHECK_TYPE_LABELS: Record<GlucoseCheckType, string> = {
	fasting: 'Fasting',
	before_breakfast: 'Before breakfast',
	before_lunch: 'Before lunch',
	before_dinner: 'Before dinner',
	bedtime: 'Bedtime',
	after_meal: '2 hrs after meal',
	prn: 'As needed (PRN)',
	recheck: 'Recheck',
};

export const CHECK_METHODS = ['fingerstick', 'cgm', 'lab'] as const;
export type GlucoseCheckMethod = (typeof CHECK_METHODS)[number];

export const CHECK_METHOD_LABELS: Record<GlucoseCheckMethod, string> = {
	fingerstick: 'Fingerstick',
	cgm: 'CGM (sensor)',
	lab: 'Lab',
};

export const SYMPTOMS = [
	'none',
	'shaky',
	'sweaty',
	'confused',
	'dizzy',
	'very_thirsty',
	'drowsy',
	'headache',
	'blurred_vision',
] as const;
export type GlucoseSymptom = (typeof SYMPTOMS)[number];

export const SYMPTOM_LABELS: Record<GlucoseSymptom, string> = {
	none: 'None',
	shaky: 'Shaky',
	sweaty: 'Sweaty',
	confused: 'Confused',
	dizzy: 'Dizzy',
	very_thirsty: 'Very thirsty',
	drowsy: 'Drowsy',
	headache: 'Headache',
	blurred_vision: 'Blurred vision',
};

export const ACTIONS = [
	'juice_or_glucose',
	'snack',
	'water',
	'nurse_notified',
	'supervisor_notified',
	'physician_notified',
	'called_911',
	'other',
] as const;
export type GlucoseAction = (typeof ACTIONS)[number];

export const ACTION_LABELS: Record<GlucoseAction, string> = {
	juice_or_glucose: 'Gave juice or glucose tabs',
	snack: 'Gave a snack',
	water: 'Encouraged water',
	nurse_notified: 'Nurse notified',
	supervisor_notified: 'Supervisor notified',
	physician_notified: 'Physician notified',
	called_911: 'Called 911',
	other: 'Other (see notes)',
};

/** Actions that mean someone was told; each needs a name in `notifiedWho`. */
export const NOTIFY_ACTIONS: ReadonlySet<GlucoseAction> = new Set([
	'nurse_notified',
	'supervisor_notified',
	'physician_notified',
	'called_911',
]);

// ── Thresholds and classification ────────────────────────────────────────

/** All values in mg/dL. A reading is classified against these, low to high. */
export interface GlucoseThresholds {
	/** Below this is a critical low. */
	criticalLow: number;
	/** Below this is low (bottom of the resident's target range). */
	low: number;
	/** Above this is high (top of the resident's target range). */
	high: number;
	/** Above this is a critical high. */
	criticalHigh: number;
}

/**
 * Placeholder defaults used when a resident has no thresholds of their own.
 * The real numbers should come from the resident's physician orders and are
 * set per resident on the profile.
 */
export const DEFAULT_GLUCOSE_THRESHOLDS: GlucoseThresholds = {
	criticalLow: 54,
	low: 70,
	high: 180,
	criticalHigh: 400,
};

export const THRESHOLD_LIMITS = {min: 20, max: 600};

export type ResidentThresholdColumns = {
	glucoseCriticalLowMgDl?: number | null;
	glucoseTargetLowMgDl?: number | null;
	glucoseTargetHighMgDl?: number | null;
	glucoseCriticalHighMgDl?: number | null;
};

/** The resident's own thresholds, falling back to defaults for any blank. */
export function resolveGlucoseThresholds(
	resident: ResidentThresholdColumns
): GlucoseThresholds {
	return {
		criticalLow: resident.glucoseCriticalLowMgDl ?? DEFAULT_GLUCOSE_THRESHOLDS.criticalLow,
		low: resident.glucoseTargetLowMgDl ?? DEFAULT_GLUCOSE_THRESHOLDS.low,
		high: resident.glucoseTargetHighMgDl ?? DEFAULT_GLUCOSE_THRESHOLDS.high,
		criticalHigh:
			resident.glucoseCriticalHighMgDl ?? DEFAULT_GLUCOSE_THRESHOLDS.criticalHigh,
	};
}

/** Returns an error message, or null when the thresholds are usable. */
export function validateGlucoseThresholds(t: GlucoseThresholds): string | null {
	const values = [t.criticalLow, t.low, t.high, t.criticalHigh];
	if (
		values.some(
			(v) =>
				!Number.isInteger(v) || v < THRESHOLD_LIMITS.min || v > THRESHOLD_LIMITS.max
		)
	) {
		return `Blood sugar limits must be whole numbers between ${THRESHOLD_LIMITS.min} and ${THRESHOLD_LIMITS.max} mg/dL`;
	}
	if (!(t.criticalLow < t.low && t.low < t.high && t.high < t.criticalHigh)) {
		return 'Blood sugar limits must go up in order: critical low, target low, target high, critical high';
	}
	return null;
}

export const GLUCOSE_STATUSES = [
	'critical_low',
	'low',
	'in_range',
	'high',
	'critical_high',
	'refused',
] as const;
export type GlucoseStatus = (typeof GLUCOSE_STATUSES)[number];

export const GLUCOSE_STATUS_LABELS: Record<GlucoseStatus, string> = {
	critical_low: 'Critical low',
	low: 'Low',
	in_range: 'In range',
	high: 'High',
	critical_high: 'Critical high',
	refused: 'Refused',
};

export function classifyReading(mgDl: number, t: GlucoseThresholds): GlucoseStatus {
	if (mgDl < t.criticalLow) return 'critical_low';
	if (mgDl < t.low) return 'low';
	if (mgDl > t.criticalHigh) return 'critical_high';
	if (mgDl > t.high) return 'high';
	return 'in_range';
}

export function isOutOfRange(status: GlucoseStatus): boolean {
	return (
		status === 'critical_low' ||
		status === 'low' ||
		status === 'high' ||
		status === 'critical_high'
	);
}

export function isCritical(status: GlucoseStatus): boolean {
	return status === 'critical_low' || status === 'critical_high';
}

/**
 * How long after an out-of-range reading the recheck is due. Lows follow the
 * usual "15 minutes after treating" rule; highs get an hour. Adjust here if
 * the facility's protocol differs.
 */
export const RECHECK_MINUTES: Partial<Record<GlucoseStatus, number>> = {
	critical_low: 15,
	low: 15,
	high: 60,
	critical_high: 60,
};

export function computeRecheckDueAt(checkedAt: Date, status: GlucoseStatus): Date | null {
	const minutes = RECHECK_MINUTES[status];
	if (minutes === undefined) return null;
	return new Date(checkedAt.getTime() + minutes * 60_000);
}

// ── Scheduled checks ─────────────────────────────────────────────────────

/** Check types a resident can be scheduled for, with the window each is expected in. */
export const SCHEDULABLE_CHECKS: ScheduleSlot[] = [
	{key: 'fasting', label: 'Fasting', from: '05:00', to: '09:00'},
	{key: 'before_breakfast', label: 'Before breakfast', from: '06:00', to: '10:00'},
	{key: 'before_lunch', label: 'Before lunch', from: '11:00', to: '14:30'},
	{key: 'before_dinner', label: 'Before dinner', from: '16:30', to: '20:30'},
	{key: 'bedtime', label: 'Bedtime', from: '20:00', to: '23:59'},
];

const SCHEDULABLE_KEYS = new Set(SCHEDULABLE_CHECKS.map((slot) => slot.key));

/** Keeps only known schedulable check types, de-duplicated, in schedule order. */
export function normalizeScheduledChecks(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	const wanted = new Set(value.filter((v): v is string => typeof v === 'string'));
	return SCHEDULABLE_CHECKS.map((slot) => slot.key).filter(
		(key) => wanted.has(key) && SCHEDULABLE_KEYS.has(key)
	);
}

export function buildGlucoseSchedule(scheduledChecks: readonly string[]): LogSchedule {
	const wanted = new Set(scheduledChecks);
	return {
		period: 'day',
		slots: SCHEDULABLE_CHECKS.filter((slot) => wanted.has(slot.key)),
	};
}

// ── Entry validation ─────────────────────────────────────────────────────

export class GlucoseEntryError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GlucoseEntryError';
	}
}

export const MAX_TEXT_LENGTH = 2000;
export const INSULIN_UNITS_LIMITS = {min: 0.5, max: 200};

export interface NormalizedGlucoseEntry {
	checkType: GlucoseCheckType;
	method: GlucoseCheckMethod;
	refused: boolean;
	refusalReason: string | null;
	readingValue: number | null;
	readingUnit: GlucoseUnit;
	readingMgDl: number | null;
	status: GlucoseStatus;
	symptoms: GlucoseSymptom[];
	actionsTaken: GlucoseAction[];
	notifiedWho: string | null;
	insulinGiven: boolean;
	insulinType: string | null;
	insulinUnits: number | null;
	notes: string | null;
}

function cleanText(value: unknown, field: string, maxLength = MAX_TEXT_LENGTH): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') throw new GlucoseEntryError(`${field} must be text`);
	const trimmed = value.trim();
	if (trimmed.length > maxLength) throw new GlucoseEntryError(`${field} is too long`);
	return trimmed || null;
}

function pickList<T extends string>(
	value: unknown,
	allowed: readonly T[],
	field: string
): T[] {
	if (value === undefined || value === null) return [];
	if (!Array.isArray(value)) throw new GlucoseEntryError(`${field} must be a list`);
	const result: T[] = [];
	for (const item of value) {
		if (typeof item !== 'string' || !(allowed as readonly string[]).includes(item)) {
			throw new GlucoseEntryError(`Unknown ${field.toLowerCase()}: ${String(item)}`);
		}
		if (!result.includes(item as T)) result.push(item as T);
	}
	// Keep the canonical order so stored lists compare cleanly.
	return allowed.filter((a) => result.includes(a));
}

function toNumber(value: unknown): number | null {
	if (value === undefined || value === null || value === '') return null;
	const n = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(n) ? n : NaN;
}

/**
 * Validates and normalizes one entry against the resident's thresholds.
 * Used for both create and edit (edit passes the merged record) so the two
 * can never disagree about what a valid entry is.
 */
export function normalizeGlucoseEntry(
	input: Record<string, unknown>,
	thresholds: GlucoseThresholds
): NormalizedGlucoseEntry {
	const checkType = input.checkType;
	if (typeof checkType !== 'string' || !(CHECK_TYPES as readonly string[]).includes(checkType)) {
		throw new GlucoseEntryError('Choose the type of check');
	}
	const method = input.method ?? 'fingerstick';
	if (typeof method !== 'string' || !(CHECK_METHODS as readonly string[]).includes(method)) {
		throw new GlucoseEntryError('Choose how the reading was taken');
	}

	const refused = input.refused === true;
	const symptoms = pickList(input.symptoms, SYMPTOMS, 'Symptom');
	if (symptoms.includes('none') && symptoms.length > 1) {
		throw new GlucoseEntryError('"None" cannot be combined with other symptoms');
	}
	const actionsTaken = pickList(input.actionsTaken, ACTIONS, 'Action');
	const notifiedWho = cleanText(input.notifiedWho, 'Who was notified', 255);
	const notes = cleanText(input.notes, 'Notes');

	if (
		input.readingUnit !== undefined &&
		input.readingUnit !== null &&
		!isGlucoseUnit(input.readingUnit)
	) {
		throw new GlucoseEntryError('Unknown unit');
	}
	const readingUnit: GlucoseUnit = isGlucoseUnit(input.readingUnit)
		? input.readingUnit
		: DEFAULT_GLUCOSE_UNIT;

	let refusalReason: string | null = null;
	let readingValue: number | null = null;
	let readingMgDl: number | null = null;
	let status: GlucoseStatus;

	if (refused) {
		refusalReason = cleanText(input.refusalReason, 'Refusal reason');
		if (!refusalReason) {
			throw new GlucoseEntryError('Say why the check was not done');
		}
		status = 'refused';
	} else {
		const raw = toNumber(input.readingValue);
		const limits = READING_LIMITS[readingUnit];
		const label = GLUCOSE_UNIT_LABELS[readingUnit];
		if (raw === null) throw new GlucoseEntryError('Enter the reading');
		if (Number.isNaN(raw) || raw < limits.min || raw > limits.max) {
			throw new GlucoseEntryError(
				`Reading must be between ${limits.min} and ${limits.max} ${label}`
			);
		}
		if (readingUnit === 'mg_dl' && !Number.isInteger(raw)) {
			throw new GlucoseEntryError('mg/dL readings are whole numbers');
		}
		if (readingUnit === 'mmol_l' && Math.abs(Math.round(raw * 10) - raw * 10) > 1e-9) {
			throw new GlucoseEntryError('mmol/L readings use at most one decimal place');
		}
		readingValue = raw;
		readingMgDl = toMgDl(raw, readingUnit);
		status = classifyReading(readingMgDl, thresholds);

		if (isOutOfRange(status)) {
			if (symptoms.length === 0) {
				throw new GlucoseEntryError(
					'This reading is out of range. Record any symptoms (or tick "None")'
				);
			}
		}
	}

	if (actionsTaken.some((a) => NOTIFY_ACTIONS.has(a)) && !notifiedWho) {
		throw new GlucoseEntryError('Enter the name of the person who was notified');
	}
	if (actionsTaken.includes('other') && !notes) {
		throw new GlucoseEntryError('Describe the "Other" action in the notes');
	}

	const insulinGiven = input.insulinGiven === true;
	let insulinType: string | null = null;
	let insulinUnits: number | null = null;
	if (insulinGiven) {
		insulinType = cleanText(input.insulinType, 'Insulin name', 100);
		if (!insulinType) throw new GlucoseEntryError('Enter the insulin name or type');
		const units = toNumber(input.insulinUnits);
		if (
			units === null ||
			Number.isNaN(units) ||
			units < INSULIN_UNITS_LIMITS.min ||
			units > INSULIN_UNITS_LIMITS.max ||
			Math.round(units * 2) !== units * 2
		) {
			throw new GlucoseEntryError(
				`Insulin dose must be between ${INSULIN_UNITS_LIMITS.min} and ${INSULIN_UNITS_LIMITS.max} units, in half units`
			);
		}
		insulinUnits = units;
	}

	// Insulin is recorded in its own section and counts as an action taken.
	if (status !== 'refused' && isOutOfRange(status) && actionsTaken.length === 0 && !insulinGiven) {
		throw new GlucoseEntryError(
			'This reading is out of range. Record what was done about it (or the insulin given)'
		);
	}

	return {
		checkType: checkType as GlucoseCheckType,
		method: method as GlucoseCheckMethod,
		refused,
		refusalReason,
		readingValue,
		readingUnit,
		readingMgDl,
		status,
		symptoms,
		actionsTaken,
		notifiedWho,
		insulinGiven,
		insulinType,
		insulinUnits,
		notes,
	};
}

/** "142 mg/dL" or "7.9 mmol/L"; "Refused" when no reading was taken. */
export function formatGlucoseReading(entry: {
	refused: boolean;
	readingValue: number | null;
	readingUnit: GlucoseUnit;
}): string {
	if (entry.refused || entry.readingValue === null) return 'Refused';
	const value =
		entry.readingUnit === 'mmol_l' ? entry.readingValue.toFixed(1) : String(entry.readingValue);
	return `${value} ${GLUCOSE_UNIT_LABELS[entry.readingUnit]}`;
}

/** Author may correct their own entry for this long; supervisors and admins any time. */
export const AUTHOR_EDIT_WINDOW_MINUTES = 30;

/** How far back a check may be logged (covers a late entry at the end of an overnight shift). */
export const MAX_BACKDATE_HOURS = 36;
/** Small allowance for clock drift between the device and the server. */
export const MAX_FUTURE_MINUTES = 5;

export function validateCheckedAt(value: unknown, now: Date): Date {
	if (value === undefined || value === null || value === '') return now;
	if (typeof value !== 'string') throw new GlucoseEntryError('Invalid check time');
	const at = new Date(value);
	if (!Number.isFinite(at.getTime())) throw new GlucoseEntryError('Invalid check time');
	if (at.getTime() > now.getTime() + MAX_FUTURE_MINUTES * 60_000) {
		throw new GlucoseEntryError('Check time cannot be in the future');
	}
	if (at.getTime() < now.getTime() - MAX_BACKDATE_HOURS * 3_600_000) {
		throw new GlucoseEntryError(
			`Checks can only be logged up to ${MAX_BACKDATE_HOURS} hours after they happen`
		);
	}
	return at;
}
