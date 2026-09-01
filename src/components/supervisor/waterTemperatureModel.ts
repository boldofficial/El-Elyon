// src/components/supervisor/waterTemperatureModel.ts
//
// Pure, framework-free logic for the monthly water-temperature management
// workspace (U5). Everything a test needs to assert -- the 31-row calendar
// projection, valid-missing versus future versus nonexistent (N/A) days,
// per-shift cell derivation, colour-independent status markers, summary
// counts, privileged correction/manual-entry/void validation, and stale
// conflict recovery -- lives here rather than inside the React component.
//
// This repository has no jsdom or React Testing Library and no
// component-rendering tests anywhere (see the note at the top of
// src/components/care/waterTemperatureEntryModel.ts), so WaterTemperature-
// Workspace.tsx renders what these functions return and owns only the
// effects (fetch, print, dialog state) that cannot be expressed as values.

import type {
	WaterTemperatureCheckDto,
	WaterTemperatureRecheckDto,
} from '@/db/queries/water-temperature';
import {
	MAX_ACTION_LENGTH,
	MAX_COMMENT_LENGTH,
	MAX_VOID_REASON_LENGTH,
	type ShiftSlot,
	type WaterTemperatureCheckState,
	type WaterTemperatureFixture,
} from '@/lib/water-temperature';
import {
	FIXTURE_LABELS,
	SHIFT_SLOT_LABELS,
	parseTemperatureField,
	type FieldIssue,
} from '../care/waterTemperatureEntryModel';

// ============================================================================
// CALENDAR CONSTANTS
// ============================================================================

/** The paper form has exactly 31 printed body rows, regardless of month
 * length. Shorter months mark the surplus rows N/A rather than dropping
 * them, so the digital grid and the printed sheet stay row-aligned (R14). */
export const WATER_TEMPERATURE_ROW_COUNT = 31;

export const WATER_TEMPERATURE_SHIFT_SLOTS: readonly ShiftSlot[] = [1, 2, 3];

export const WATER_TEMPERATURE_MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December',
] as const;

/** Staff identifier stored on a supervisor/admin manual backfill. A paper
 * form recorded before the app existed has no digital identity for the
 * observing worker, so the snapshot records the entry's provenance instead of
 * inventing (or borrowing) a real staff ID. The reasoned revision written by
 * the mutation still carries the acting supervisor's own actor ID. */
export const MANUAL_ENTRY_STAFF_ID = 'manual-entry';

export function monthName(month: number): string {
	return WATER_TEMPERATURE_MONTH_NAMES[month - 1] ?? '';
}

/** Calendar-correct day count, including leap years (February 2028 -> 29,
 * February 2027 -> 28). Uses a UTC day-0 rollover so a browser timezone can
 * never shift the boundary. */
export function daysInMonth(year: number, month: number): number {
	if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
		return 0;
	}
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function toOperationalDate(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `1st`, `2nd`, `3rd`, `4th` … `21st` … `31st` -- the source form's row
 * labels, reproduced exactly. */
export function ordinalDayLabel(day: number): string {
	const teens = day % 100;
	if (teens >= 11 && teens <= 13) return `${day}th`;
	switch (day % 10) {
		case 1:
			return `${day}st`;
		case 2:
			return `${day}nd`;
		case 3:
			return `${day}rd`;
		default:
			return `${day}th`;
	}
}

// ============================================================================
// CELL STATUS
// ============================================================================

export type WaterTemperatureCellStatus =
	/** The calendar day does not exist in this month (Feb 30). Never a missing
	 * obligation, and never reminder-generating (R14/AE9). */
	| 'na'
	/** A valid day that has not arrived yet: blank, but not delinquent. */
	| 'future'
	/** A valid, elapsed day with no active record: explicitly Missing in the
	 * digital view and blank on paper (R14). */
	| 'missing'
	| 'complete'
	| 'complete_with_attention'
	| 'action_required'
	| 'recheck_required';

export type WaterTemperatureCellTone = 'muted' | 'neutral' | 'positive' | 'attention' | 'urgent';

/**
 * Every status carries a symbol AND a word. Nothing in the grid may be
 * distinguishable by colour alone (R12 / plan test scenario 2), so the tone
 * is only ever an additional cue on top of the printed marker and label.
 */
export type WaterTemperatureCellMarker = {
	status: WaterTemperatureCellStatus;
	symbol: string;
	label: string;
	tone: WaterTemperatureCellTone;
};

export const WATER_TEMPERATURE_CELL_MARKERS: Record<
	WaterTemperatureCellStatus,
	WaterTemperatureCellMarker
> = {
	na: {status: 'na', symbol: 'N/A', label: 'Not a valid date', tone: 'muted'},
	future: {status: 'future', symbol: '·', label: 'Not yet due', tone: 'muted'},
	missing: {status: 'missing', symbol: '—', label: 'Missing', tone: 'neutral'},
	complete: {status: 'complete', symbol: '✓', label: 'Complete', tone: 'positive'},
	complete_with_attention: {
		status: 'complete_with_attention',
		symbol: '▲',
		label: 'Complete — below range',
		tone: 'attention',
	},
	action_required: {
		status: 'action_required',
		symbol: '!',
		label: 'Action required',
		tone: 'urgent',
	},
	recheck_required: {
		status: 'recheck_required',
		symbol: '!!',
		label: 'Recheck required',
		tone: 'urgent',
	},
};

export function cellMarker(status: WaterTemperatureCellStatus): WaterTemperatureCellMarker {
	return WATER_TEMPERATURE_CELL_MARKERS[status];
}

// ============================================================================
// MONTH PROJECTION
// ============================================================================

export type WaterTemperatureMonthCell = {
	slot: ShiftSlot;
	slotLabel: string;
	/** null only for a nonexistent calendar day. */
	date: string | null;
	status: WaterTemperatureCellStatus;
	marker: WaterTemperatureCellMarker;
	check: WaterTemperatureCheckDto | null;
	/** The ORIGINAL observations. A later safe recheck never replaces them
	 * here or in print (R7); the recheck chain is separate. */
	kitchenTempF: number | null;
	bathTempF: number | null;
	initials: string;
	belowRange: boolean;
	aboveRange: boolean;
	/** Fixtures that started above 115°F and still lack a safe latest active
	 * recheck. Empty once every affected fixture is resolved. */
	unresolvedFixtures: WaterTemperatureFixture[];
	activeRechecks: WaterTemperatureRecheckDto[];
	supersededRechecks: WaterTemperatureRecheckDto[];
	/** Voided predecessors for this identity, newest first. A void reopens the
	 * obligation (the active cell becomes Missing) but never erases history. */
	voidedHistory: WaterTemperatureCheckDto[];
	canRecordManualEntry: boolean;
	canCorrect: boolean;
	canVoid: boolean;
};

export type WaterTemperatureMonthRow = {
	day: number;
	/** `1st` … `31st`, exactly as printed on the source form. */
	dayLabel: string;
	date: string | null;
	existsInMonth: boolean;
	isFuture: boolean;
	cells: WaterTemperatureMonthCell[];
};

export type WaterTemperatureMonthSummary = {
	validDays: number;
	naDays: number;
	/** Valid days × 3 shifts. N/A cells are excluded from every count. */
	obligationCount: number;
	complete: number;
	completeWithAttention: number;
	actionRequired: number;
	recheckRequired: number;
	missing: number;
	future: number;
	naCells: number;
	voidedRecords: number;
	/** Cells whose above-115°F response is still unresolved. */
	unresolved: number;
};

export type WaterTemperatureMonthView = {
	year: number;
	month: number;
	monthLabel: string;
	rows: WaterTemperatureMonthRow[];
	summary: WaterTemperatureMonthSummary;
};

function isVoided(record: WaterTemperatureCheckDto): boolean {
	return Boolean(record.voidedAt);
}

/** Splits one month listing (fetched with includeVoided=true) into the single
 * active record per identity and the voided history behind it. */
export function partitionMonthRecords(records: readonly WaterTemperatureCheckDto[]): {
	active: WaterTemperatureCheckDto[];
	voided: WaterTemperatureCheckDto[];
} {
	const active: WaterTemperatureCheckDto[] = [];
	const voided: WaterTemperatureCheckDto[] = [];
	for (const record of records) {
		if (isVoided(record)) voided.push(record);
		else active.push(record);
	}
	return {active, voided};
}

function identityKey(date: string, slot: ShiftSlot | number): string {
	return `${date}|${slot}`;
}

function activeRechecksFor(
	check: WaterTemperatureCheckDto,
	fixture: WaterTemperatureFixture
): WaterTemperatureRecheckDto[] {
	return check.rechecks
		.filter((recheck) => recheck.fixture === fixture && !recheck.supersededAt && !recheck.voidedAt)
		.slice()
		.sort((left, right) => left.sequence - right.sequence);
}

/** Fixtures whose ORIGINAL reading was above 115°F and whose latest active
 * recheck is not yet safe. Derived from the immutable originals, never from
 * the substituted latest value. */
export function unresolvedFixturesFor(
	check: WaterTemperatureCheckDto
): WaterTemperatureFixture[] {
	const classifications: Record<WaterTemperatureFixture, string> = {
		kitchen: check.kitchenClassification,
		bath_shower: check.bathClassification,
	};
	const affected = (['kitchen', 'bath_shower'] as const).filter(
		(fixture) => classifications[fixture] === 'above'
	);
	return affected.filter((fixture) => {
		const history = activeRechecksFor(check, fixture);
		const latest = history[history.length - 1];
		return !latest || latest.classification !== 'safe';
	});
}

function stateToCellStatus(state: WaterTemperatureCheckState): WaterTemperatureCellStatus {
	return state;
}

function emptyCell(args: {
	slot: ShiftSlot;
	date: string | null;
	status: WaterTemperatureCellStatus;
	voidedHistory: WaterTemperatureCheckDto[];
}): WaterTemperatureMonthCell {
	return {
		slot: args.slot,
		slotLabel: SHIFT_SLOT_LABELS[args.slot],
		date: args.date,
		status: args.status,
		marker: cellMarker(args.status),
		check: null,
		kitchenTempF: null,
		bathTempF: null,
		initials: '',
		belowRange: false,
		aboveRange: false,
		unresolvedFixtures: [],
		activeRechecks: [],
		supersededRechecks: [],
		voidedHistory: args.voidedHistory,
		// A nonexistent or future day is never a missing obligation, so no
		// backfill is offered for it.
		canRecordManualEntry: args.status === 'missing',
		canCorrect: false,
		canVoid: false,
	};
}

function recordedCell(args: {
	slot: ShiftSlot;
	date: string;
	check: WaterTemperatureCheckDto;
	voidedHistory: WaterTemperatureCheckDto[];
}): WaterTemperatureMonthCell {
	const {check} = args;
	const status = stateToCellStatus(check.state);
	const activeRechecks = check.rechecks
		.filter((recheck) => !recheck.supersededAt && !recheck.voidedAt)
		.slice()
		.sort((left, right) => left.sequence - right.sequence);
	const supersededRechecks = check.rechecks
		.filter((recheck) => Boolean(recheck.supersededAt) || Boolean(recheck.voidedAt))
		.slice()
		.sort((left, right) => left.sequence - right.sequence);

	return {
		slot: args.slot,
		slotLabel: SHIFT_SLOT_LABELS[args.slot],
		date: args.date,
		status,
		marker: cellMarker(status),
		check,
		kitchenTempF: check.kitchenTempF,
		bathTempF: check.bathTempF,
		initials: check.staffInitials,
		belowRange:
			check.kitchenClassification === 'below' || check.bathClassification === 'below',
		aboveRange:
			check.kitchenClassification === 'above' || check.bathClassification === 'above',
		unresolvedFixtures: unresolvedFixturesFor(check),
		activeRechecks,
		supersededRechecks,
		voidedHistory: args.voidedHistory,
		canRecordManualEntry: false,
		canCorrect: true,
		canVoid: true,
	};
}

/**
 * Builds the fixed 31-row monthly grid.
 *
 * Rows beyond the month's length are `na` and are excluded from every
 * obligation count. Valid days with no active record are `missing` once the
 * day has arrived and `future` before that, so an unstarted day is never
 * reported as delinquent (R12/R14).
 */
export function buildWaterTemperatureMonth(args: {
	year: number;
	month: number;
	records: readonly WaterTemperatureCheckDto[];
	/** Organization-local "today" as YYYY-MM-DD. Presentation-only: it decides
	 * `future` versus `missing` and never changes stored facts. */
	todayLocalDate: string;
}): WaterTemperatureMonthView {
	const length = daysInMonth(args.year, args.month);
	const {active, voided} = partitionMonthRecords(args.records);

	const activeByIdentity = new Map<string, WaterTemperatureCheckDto>();
	for (const record of active) {
		activeByIdentity.set(identityKey(record.operationalDate, record.shiftSlot), record);
	}
	const voidedByIdentity = new Map<string, WaterTemperatureCheckDto[]>();
	for (const record of voided) {
		const key = identityKey(record.operationalDate, record.shiftSlot);
		const list = voidedByIdentity.get(key) ?? [];
		list.push(record);
		voidedByIdentity.set(key, list);
	}
	for (const list of voidedByIdentity.values()) {
		list.sort((left, right) => (right.voidedAt ?? '').localeCompare(left.voidedAt ?? ''));
	}

	const rows: WaterTemperatureMonthRow[] = [];
	for (let day = 1; day <= WATER_TEMPERATURE_ROW_COUNT; day += 1) {
		const existsInMonth = day <= length;
		const date = existsInMonth ? toOperationalDate(args.year, args.month, day) : null;
		const isFuture = existsInMonth && date !== null && date > args.todayLocalDate;

		const cells = WATER_TEMPERATURE_SHIFT_SLOTS.map((slot) => {
			if (!existsInMonth || date === null) {
				return emptyCell({slot, date: null, status: 'na', voidedHistory: []});
			}
			const key = identityKey(date, slot);
			const voidedHistory = voidedByIdentity.get(key) ?? [];
			const check = activeByIdentity.get(key);
			if (check) return recordedCell({slot, date, check, voidedHistory});
			// A voided record leaves no active row, so the cell immediately
			// reads Missing again and the obligation is reopened (AE7).
			return emptyCell({
				slot,
				date,
				status: isFuture ? 'future' : 'missing',
				voidedHistory,
			});
		});

		rows.push({
			day,
			dayLabel: ordinalDayLabel(day),
			date,
			existsInMonth,
			isFuture,
			cells,
		});
	}

	return {
		year: args.year,
		month: args.month,
		monthLabel: `${monthName(args.month)} ${args.year}`,
		rows,
		summary: summarizeWaterTemperatureMonth(rows, voided.length),
	};
}

export function summarizeWaterTemperatureMonth(
	rows: readonly WaterTemperatureMonthRow[],
	voidedRecords = 0
): WaterTemperatureMonthSummary {
	const summary: WaterTemperatureMonthSummary = {
		validDays: 0,
		naDays: 0,
		obligationCount: 0,
		complete: 0,
		completeWithAttention: 0,
		actionRequired: 0,
		recheckRequired: 0,
		missing: 0,
		future: 0,
		naCells: 0,
		voidedRecords,
		unresolved: 0,
	};

	for (const row of rows) {
		if (row.existsInMonth) summary.validDays += 1;
		else summary.naDays += 1;
		for (const cell of row.cells) {
			if (cell.status === 'na') {
				summary.naCells += 1;
				continue;
			}
			summary.obligationCount += 1;
			switch (cell.status) {
				case 'complete':
					summary.complete += 1;
					break;
				case 'complete_with_attention':
					summary.completeWithAttention += 1;
					break;
				case 'action_required':
					summary.actionRequired += 1;
					break;
				case 'recheck_required':
					summary.recheckRequired += 1;
					break;
				case 'missing':
					summary.missing += 1;
					break;
				case 'future':
					summary.future += 1;
					break;
			}
			if (cell.unresolvedFixtures.length > 0) summary.unresolved += 1;
		}
	}

	return summary;
}

/** One sentence describing a cell for assistive technology and for the cell's
 * accessible name, so the grid never depends on the colour swatch. */
export function describeCell(cell: WaterTemperatureMonthCell): string {
	const where = `${cell.date ?? 'nonexistent date'}, ${cell.slotLabel}`;
	if (cell.status === 'na') return `${cell.slotLabel}: not a valid date in this month`;
	if (cell.status === 'future') return `${where}: not yet due`;
	if (cell.status === 'missing') return `${where}: missing — no water temperature recorded`;
	const readings =
		`kitchen ${formatTemperature(cell.kitchenTempF)}, ` +
		`bath/shower ${formatTemperature(cell.bathTempF)}`;
	const unresolved =
		cell.unresolvedFixtures.length > 0
			? `, unresolved: ${cell.unresolvedFixtures.map((fixture) => FIXTURE_LABELS[fixture]).join(' and ')}`
			: '';
	return `${where}: ${cell.marker.label}, ${readings}, initials ${cell.initials}${unresolved}`;
}

export function formatTemperature(value: number | null): string {
	return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}°F`;
}

// ============================================================================
// SCOPE READINESS (house + month/year selectors)
// ============================================================================

export type WaterTemperatureScope = {locationId: string; year: number; month: number};

export type WaterTemperatureLoadState = 'idle' | 'loading' | 'ready' | 'error';

export function sameWaterTemperatureScope(
	left: WaterTemperatureScope | null | undefined,
	right: WaterTemperatureScope | null | undefined
): boolean {
	return Boolean(
		left &&
			right &&
			left.locationId === right.locationId &&
			left.year === right.year &&
			left.month === right.month
	);
}

/** Records are only "ready" when the loaded scope still matches the selected
 * one, so a slow response for a previous house/month can never be treated as
 * the current house's data (R18). */
export function isWaterTemperatureScopeReady(args: {
	currentScope: WaterTemperatureScope | null;
	loadedScope: WaterTemperatureScope | null;
	recordsState: WaterTemperatureLoadState;
}): boolean {
	return (
		args.recordsState === 'ready' &&
		sameWaterTemperatureScope(args.currentScope, args.loadedScope)
	);
}

export function isValidReportYear(year: number): boolean {
	return Number.isInteger(year) && year >= 2020 && year <= 2100;
}

export function isValidReportMonth(month: number): boolean {
	return Number.isInteger(month) && month >= 1 && month <= 12;
}

// ============================================================================
// PRIVILEGED WRITE VALIDATION
//
// Correction, manual missing-slot entry, and void all require a reason, and
// the two operations on an existing record additionally require the record's
// current version (R11/AE7). These validators refuse to produce a payload
// without them, so the UI cannot submit an unreasoned or unversioned change.
// ============================================================================

const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;
export const MAX_REASON_LENGTH = MAX_VOID_REASON_LENGTH;
const MAX_STAFF_NAME_LENGTH = 255;
const MAX_STAFF_INITIALS_LENGTH = 10;

export const WATER_TEMPERATURE_WORKSPACE_IDS = {
	kitchen: 'water-temperature-admin-kitchen',
	bath: 'water-temperature-admin-bath',
	comments: 'water-temperature-admin-comments',
	action: 'water-temperature-admin-action',
	reason: 'water-temperature-admin-reason',
	staffName: 'water-temperature-admin-staff-name',
	staffInitials: 'water-temperature-admin-staff-initials',
	observedAt: 'water-temperature-admin-observed-at',
	voidReason: 'water-temperature-admin-void-reason',
} as const;

function validateText(args: {
	raw: string;
	label: string;
	maxLength: number;
	required: boolean;
}): {message: string | null; value: string | null} {
	const trimmed = args.raw.trim();
	if (trimmed.length === 0) {
		return args.required ? {message: `${args.label} is required.`, value: null} : {message: null, value: null};
	}
	if (trimmed.length > args.maxLength) {
		return {message: `${args.label} must be ${args.maxLength} characters or fewer.`, value: null};
	}
	if (CONTROL_CHAR_PATTERN.test(trimmed)) {
		return {message: `${args.label} contains unsupported characters.`, value: null};
	}
	return {message: null, value: trimmed};
}

export type CorrectionDraft = {
	kitchenTempF: string;
	bathTempF: string;
	comments: string;
	action: string;
	reason: string;
};

export type CorrectionValues = {
	expectedVersion: number;
	kitchenTempF: number;
	bathTempF: number;
	comments: string | null;
	action: string | null;
	reason: string;
};

export type DraftValidation<TValues> = {
	isValid: boolean;
	summary: FieldIssue[];
	fieldErrors: Record<string, string | null>;
	values: TValues | null;
};

export function correctionDraftFromCheck(check: WaterTemperatureCheckDto): CorrectionDraft {
	return {
		kitchenTempF: check.kitchenTempF.toFixed(1),
		bathTempF: check.bathTempF.toFixed(1),
		comments: check.comments ?? '',
		action: check.action ?? '',
		reason: '',
	};
}

export function validateCorrectionDraft(args: {
	draft: CorrectionDraft;
	expectedVersion: number | null;
}): DraftValidation<CorrectionValues> {
	const ids = WATER_TEMPERATURE_WORKSPACE_IDS;
	const kitchen = parseTemperatureField(args.draft.kitchenTempF);
	const bath = parseTemperatureField(args.draft.bathTempF);
	const comments = validateText({
		raw: args.draft.comments,
		label: 'Comments',
		maxLength: MAX_COMMENT_LENGTH,
		required: false,
	});
	const action = validateText({
		raw: args.draft.action,
		label: 'Action taken',
		maxLength: MAX_ACTION_LENGTH,
		required: false,
	});
	const reason = validateText({
		raw: args.draft.reason,
		label: 'Correction reason',
		maxLength: MAX_REASON_LENGTH,
		required: true,
	});

	const fieldErrors: Record<string, string | null> = {
		[ids.kitchen]: kitchen.ok ? null : kitchen.message,
		[ids.bath]: bath.ok ? null : bath.message,
		[ids.comments]: comments.message,
		[ids.action]: action.message,
		[ids.reason]: reason.message,
	};

	const summary = buildSummary([
		[ids.kitchen, fieldErrors[ids.kitchen] && `Kitchen temperature: ${fieldErrors[ids.kitchen]}`],
		[ids.bath, fieldErrors[ids.bath] && `Bath/shower temperature: ${fieldErrors[ids.bath]}`],
		[ids.comments, fieldErrors[ids.comments]],
		[ids.action, fieldErrors[ids.action]],
		[ids.reason, fieldErrors[ids.reason]],
	]);

	const versionValid = Number.isInteger(args.expectedVersion) && (args.expectedVersion ?? 0) >= 1;
	if (!versionValid) {
		summary.push({
			fieldId: ids.reason,
			message: 'The current record version is unavailable. Reload the month before correcting.',
		});
	}

	const isValid = summary.length === 0;
	return {
		isValid,
		summary,
		fieldErrors,
		values:
			isValid && kitchen.ok && bath.ok && reason.value && args.expectedVersion !== null
				? {
						expectedVersion: args.expectedVersion,
						kitchenTempF: kitchen.value,
						bathTempF: bath.value,
						comments: comments.value,
						action: action.value,
						reason: reason.value,
					}
				: null,
	};
}

export type ManualEntryDraft = {
	kitchenTempF: string;
	bathTempF: string;
	comments: string;
	staffName: string;
	staffInitials: string;
	/** `YYYY-MM-DDTHH:mm` from a datetime-local input. */
	observedAt: string;
	reason: string;
};

export type ManualEntryValues = {
	locationId: string;
	shiftSlot: ShiftSlot;
	operationalDate: string;
	kitchenTempF: number;
	bathTempF: number;
	staffId: string;
	staffName: string;
	staffInitials: string;
	observedAt: string;
	comments: string | null;
	reason: string;
};

export function emptyManualEntryDraft(operationalDate: string): ManualEntryDraft {
	return {
		kitchenTempF: '',
		bathTempF: '',
		comments: '',
		staffName: '',
		staffInitials: '',
		observedAt: `${operationalDate}T08:00`,
		reason: '',
	};
}

export function validateManualEntryDraft(args: {
	draft: ManualEntryDraft;
	locationId: string;
	operationalDate: string;
	shiftSlot: ShiftSlot;
}): DraftValidation<ManualEntryValues> {
	const ids = WATER_TEMPERATURE_WORKSPACE_IDS;
	const kitchen = parseTemperatureField(args.draft.kitchenTempF);
	const bath = parseTemperatureField(args.draft.bathTempF);
	const comments = validateText({
		raw: args.draft.comments,
		label: 'Comments',
		maxLength: MAX_COMMENT_LENGTH,
		required: false,
	});
	const staffName = validateText({
		raw: args.draft.staffName,
		label: 'Recorded by',
		maxLength: MAX_STAFF_NAME_LENGTH,
		required: true,
	});
	const staffInitials = validateText({
		raw: args.draft.staffInitials,
		label: 'Initials',
		maxLength: MAX_STAFF_INITIALS_LENGTH,
		required: true,
	});
	const reason = validateText({
		raw: args.draft.reason,
		label: 'Manual entry reason',
		maxLength: MAX_REASON_LENGTH,
		required: true,
	});
	const observedAt = parseObservedAt(args.draft.observedAt, args.operationalDate);

	const fieldErrors: Record<string, string | null> = {
		[ids.kitchen]: kitchen.ok ? null : kitchen.message,
		[ids.bath]: bath.ok ? null : bath.message,
		[ids.comments]: comments.message,
		[ids.staffName]: staffName.message,
		[ids.staffInitials]: staffInitials.message,
		[ids.observedAt]: observedAt.message,
		[ids.reason]: reason.message,
	};

	const summary = buildSummary([
		[ids.kitchen, fieldErrors[ids.kitchen] && `Kitchen temperature: ${fieldErrors[ids.kitchen]}`],
		[ids.bath, fieldErrors[ids.bath] && `Bath/shower temperature: ${fieldErrors[ids.bath]}`],
		[ids.staffName, fieldErrors[ids.staffName]],
		[ids.staffInitials, fieldErrors[ids.staffInitials]],
		[ids.observedAt, fieldErrors[ids.observedAt]],
		[ids.comments, fieldErrors[ids.comments]],
		[ids.reason, fieldErrors[ids.reason]],
	]);

	const isValid = summary.length === 0;
	return {
		isValid,
		summary,
		fieldErrors,
		values:
			isValid && kitchen.ok && bath.ok && staffName.value && staffInitials.value && reason.value && observedAt.value
				? {
						locationId: args.locationId,
						shiftSlot: args.shiftSlot,
						operationalDate: args.operationalDate,
						kitchenTempF: kitchen.value,
						bathTempF: bath.value,
						staffId: MANUAL_ENTRY_STAFF_ID,
						staffName: staffName.value,
						staffInitials: staffInitials.value,
						observedAt: observedAt.value,
						comments: comments.value,
						reason: reason.value,
					}
				: null,
	};
}

/** The observation instant must fall on the obligation's operational date;
 * anything else would silently attribute a reading to the wrong business day. */
function parseObservedAt(
	raw: string,
	operationalDate: string
): {message: string | null; value: string | null} {
	const trimmed = raw.trim();
	if (trimmed.length === 0) return {message: 'Observation time is required.', value: null};
	if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(trimmed)) {
		return {message: 'Enter the observation time as a date and time.', value: null};
	}
	if (!trimmed.startsWith(`${operationalDate}T`)) {
		return {
			message: `Observation time must fall on ${operationalDate}.`,
			value: null,
		};
	}
	const parsed = new Date(trimmed);
	if (Number.isNaN(parsed.getTime())) {
		return {message: 'Enter a valid observation date and time.', value: null};
	}
	return {message: null, value: parsed.toISOString()};
}

export type VoidDraft = {reason: string};

export type VoidValues = {expectedVersion: number; reason: string};

export function validateVoidDraft(args: {
	draft: VoidDraft;
	expectedVersion: number | null;
}): DraftValidation<VoidValues> {
	const ids = WATER_TEMPERATURE_WORKSPACE_IDS;
	const reason = validateText({
		raw: args.draft.reason,
		label: 'Void reason',
		maxLength: MAX_REASON_LENGTH,
		required: true,
	});
	const fieldErrors: Record<string, string | null> = {[ids.voidReason]: reason.message};
	const summary = buildSummary([[ids.voidReason, reason.message]]);

	const versionValid = Number.isInteger(args.expectedVersion) && (args.expectedVersion ?? 0) >= 1;
	if (!versionValid) {
		summary.push({
			fieldId: ids.voidReason,
			message: 'The current record version is unavailable. Reload the month before voiding.',
		});
	}

	const isValid = summary.length === 0;
	return {
		isValid,
		summary,
		fieldErrors,
		values: isValid && reason.value && args.expectedVersion !== null
			? {expectedVersion: args.expectedVersion, reason: reason.value}
			: null,
	};
}

function buildSummary(entries: Array<[string, string | null | undefined | false]>): FieldIssue[] {
	const summary: FieldIssue[] = [];
	for (const [fieldId, message] of entries) {
		if (message) summary.push({fieldId, message});
	}
	return summary;
}

/**
 * True when this cell holds an active record whose void would immediately
 * reopen the house/date/slot obligation -- which is exactly what makes a
 * matching active staff reminder return. Expressed as a value so the
 * consequence is asserted rather than assumed.
 */
export function voidWouldReopenObligation(cell: WaterTemperatureMonthCell): boolean {
	return cell.canVoid && cell.check !== null;
}

// ============================================================================
// CONFLICT RECOVERY
// ============================================================================

export type WorkspaceMutationOutcomeKind =
	| 'stale'
	| 'not_found'
	| 'access_denied'
	| 'unauthenticated'
	| 'validation'
	| 'network'
	| 'server';

export type WorkspaceMutationOutcome = {
	kind: WorkspaceMutationOutcomeKind;
	message: string;
	/** A stale write must reload the authoritative record before the operator
	 * decides whether to reapply the change (R17). */
	reload: boolean;
	/** Keep what the operator typed on every recoverable failure. */
	preserveDraft: boolean;
	current: WaterTemperatureCheckDto | null;
	role: 'status' | 'alert';
};

function readCurrent(body: unknown): WaterTemperatureCheckDto | null {
	if (!body || typeof body !== 'object') return null;
	const current = (body as {current?: unknown}).current;
	if (!current || typeof current !== 'object') return null;
	return current as WaterTemperatureCheckDto;
}

function readErrorMessage(body: unknown): string | null {
	if (!body || typeof body !== 'object') return null;
	const error = (body as {error?: unknown}).error;
	return typeof error === 'string' && error.trim().length > 0 ? error : null;
}

export function mapWorkspaceMutationFailure(args: {
	operation: 'correct' | 'manual-create' | 'void';
	httpStatus: number | null;
	body: unknown;
}): WorkspaceMutationOutcome {
	const current = readCurrent(args.body);
	const serverMessage = readErrorMessage(args.body);

	if (args.httpStatus === null) {
		return {
			kind: 'network',
			message:
				'The change could not be confirmed. Reloading the current month — your ' +
				'entry has been kept so you can retry without retyping.',
			reload: true,
			preserveDraft: true,
			current: null,
			role: 'status',
		};
	}

	if (args.httpStatus === 409) {
		return {
			kind: 'stale',
			message:
				args.operation === 'manual-create'
					? 'Another record now exists for this house, date, and shift. The ' +
						'current month has been reloaded — review it before entering another.'
					: 'This record changed while you were editing it. The current record ' +
						'has been reloaded — review it and apply your change again.',
			reload: true,
			preserveDraft: true,
			current,
			role: 'alert',
		};
	}

	if (args.httpStatus === 404) {
		return {
			kind: 'not_found',
			message: 'This record is no longer available. Reloading the current month.',
			reload: true,
			preserveDraft: true,
			current: null,
			role: 'alert',
		};
	}

	if (args.httpStatus === 403) {
		return {
			kind: 'access_denied',
			message: 'You are not authorized to change records for this house.',
			reload: true,
			preserveDraft: true,
			current: null,
			role: 'alert',
		};
	}

	if (args.httpStatus === 401) {
		return {
			kind: 'unauthenticated',
			message: 'Your session has expired. Sign in again to continue.',
			reload: false,
			preserveDraft: true,
			current: null,
			role: 'alert',
		};
	}

	if (args.httpStatus >= 400 && args.httpStatus < 500) {
		return {
			kind: 'validation',
			message: serverMessage || 'The change could not be saved. Check the values and try again.',
			reload: false,
			preserveDraft: true,
			current: null,
			role: 'alert',
		};
	}

	return {
		kind: 'server',
		message:
			'The change could not be saved right now. Reloading the current month — ' +
			'your entry has been kept so you can retry.',
		reload: true,
		preserveDraft: true,
		current: null,
		role: 'alert',
	};
}

export type {FieldIssue};
