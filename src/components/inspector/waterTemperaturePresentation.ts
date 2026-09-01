// src/components/inspector/waterTemperaturePresentation.ts
//
// Pure presentation logic for the inspector's read-only Daily Water
// Temperature Check Log (U6).
//
// This repository has no jsdom or React Testing Library, so every decision the
// inspector panel renders -- the 31-row calendar projection, explicit
// missing / N/A / pending states, colour-independent markers, month-label and
// temperature formatting, stale-scope readiness, and the mapping that feeds
// U5's shared print builder -- lives here and is asserted in
// waterTemperaturePresentation.test.ts. InspectorDashboard.tsx owns only the
// effects (fetch, print, tab state).
//
// The only cross-surface imports are U5's SHARED PRINT BUILDER and the shared
// form copy. No supervisor mutation, correction, revision, or void code is
// imported here, and this module offers no authoring affordance of any kind.

import type {
	InspectorShiftSlot,
	InspectorWaterTemperatureCheck,
	InspectorWaterTemperatureMonth,
	InspectorWaterTemperatureRecheck,
	InspectorWaterTemperatureState,
} from '@/lib/inspector-water-temperature-projection';
import {
	isValidInspectorReportMonth,
	isValidInspectorReportYear,
} from '@/lib/inspector-water-temperature-projection';
import {
	WATER_TEMPERATURE_ROW_COUNT,
	daysInMonth,
	ordinalDayLabel,
	type PrintableWaterTemperatureMonth,
} from '@/components/supervisor/printWaterTemperatureReport';
import {FIXTURE_LABELS, SHIFT_SLOT_LABELS} from '@/components/care/waterTemperatureEntryModel';

export const INSPECTOR_WATER_TEMPERATURE_SHIFT_SLOTS: readonly InspectorShiftSlot[] = [1, 2, 3];

export const INSPECTOR_WATER_TEMPERATURE_MONTH_NAMES = [
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

/** Rendered on the panel so the read-only boundary is stated, not implied. */
export const INSPECTOR_WATER_TEMPERATURE_READ_ONLY_NOTICE =
	'Read-only view of the house in this inspector session. Records cannot be ' +
	'added, corrected, or removed here.';

export const INSPECTOR_WATER_TEMPERATURE_LEGEND_NOTICE =
	'Missing means a valid day with no recorded check. N/A means the date does ' +
	'not exist in this month and is never a missing obligation.';

// ============================================================================
// CELL STATUS
// ============================================================================

export type InspectorWaterTemperatureCellStatus =
	| 'na'
	| 'future'
	| 'missing'
	| InspectorWaterTemperatureState;

export type InspectorWaterTemperatureCellTone =
	| 'muted'
	| 'neutral'
	| 'positive'
	| 'attention'
	| 'urgent';

/** Every status carries a symbol AND a word: nothing in the inspector grid may
 * be distinguishable by colour alone (R12). */
export type InspectorWaterTemperatureMarker = {
	status: InspectorWaterTemperatureCellStatus;
	symbol: string;
	label: string;
	tone: InspectorWaterTemperatureCellTone;
};

export const INSPECTOR_WATER_TEMPERATURE_MARKERS: Record<
	InspectorWaterTemperatureCellStatus,
	InspectorWaterTemperatureMarker
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
		label: 'Pending — action required',
		tone: 'urgent',
	},
	recheck_required: {
		status: 'recheck_required',
		symbol: '!!',
		label: 'Pending — recheck required',
		tone: 'urgent',
	},
};

export function inspectorCellMarker(
	status: InspectorWaterTemperatureCellStatus
): InspectorWaterTemperatureMarker {
	return INSPECTOR_WATER_TEMPERATURE_MARKERS[status];
}

// ============================================================================
// MONTH VIEW
// ============================================================================

export type InspectorWaterTemperatureCell = {
	slot: InspectorShiftSlot;
	slotLabel: string;
	/** null only for a nonexistent calendar day. */
	date: string | null;
	status: InspectorWaterTemperatureCellStatus;
	marker: InspectorWaterTemperatureMarker;
	check: InspectorWaterTemperatureCheck | null;
	/** The ORIGINAL observations; a later safe recheck never replaces them. */
	kitchenTempF: number | null;
	bathTempF: number | null;
	initials: string;
	belowRange: boolean;
	aboveRange: boolean;
	rechecks: readonly InspectorWaterTemperatureRecheck[];
	description: string;
};

export type InspectorWaterTemperatureRow = {
	day: number;
	dayLabel: string;
	date: string | null;
	existsInMonth: boolean;
	isFuture: boolean;
	cells: InspectorWaterTemperatureCell[];
};

export type InspectorWaterTemperatureSummary = {
	validDays: number;
	naDays: number;
	/** Valid days × 3 shifts. N/A cells are excluded from every count. */
	obligationCount: number;
	complete: number;
	completeWithAttention: number;
	actionRequired: number;
	recheckRequired: number;
	/** actionRequired + recheckRequired: an unresolved above-115°F response. */
	pending: number;
	missing: number;
	future: number;
	naCells: number;
};

export type InspectorWaterTemperatureMonthView = {
	houseName: string;
	year: number;
	month: number;
	monthLabel: string;
	rows: InspectorWaterTemperatureRow[];
	summary: InspectorWaterTemperatureSummary;
};

export function inspectorMonthName(month: number): string {
	return INSPECTOR_WATER_TEMPERATURE_MONTH_NAMES[month - 1] ?? '';
}

export function inspectorMonthLabel(year: number, month: number): string {
	return `${inspectorMonthName(month)} ${year}`;
}

export function toInspectorOperationalDate(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatInspectorTemperature(value: number | null): string {
	return value === null || !Number.isFinite(value) ? '—' : `${value.toFixed(1)}°F`;
}

/**
 * Builds the fixed 31-row grid from the inspector projection.
 *
 * Rows beyond the month's length are `na` and are excluded from every
 * obligation count. Valid days with no record are `missing` once the day has
 * arrived and `future` before that, so an unstarted day is never shown as
 * delinquent (R12/R14/AE9). Voided rows never appear at all: they are already
 * excluded from the projection.
 */
export function buildInspectorWaterTemperatureMonthView(args: {
	data: InspectorWaterTemperatureMonth;
	/** Organization-local "today" as YYYY-MM-DD. Presentation-only. */
	todayLocalDate: string;
}): InspectorWaterTemperatureMonthView {
	const {year, month} = args.data;
	const length = daysInMonth(year, month);

	const byIdentity = new Map<string, InspectorWaterTemperatureCheck>();
	for (const check of args.data.checks) {
		byIdentity.set(`${check.operationalDate}|${check.shiftSlot}`, check);
	}

	const rows: InspectorWaterTemperatureRow[] = [];
	for (let day = 1; day <= WATER_TEMPERATURE_ROW_COUNT; day += 1) {
		const existsInMonth = day <= length;
		const date = existsInMonth ? toInspectorOperationalDate(year, month, day) : null;
		const isFuture = date !== null && date > args.todayLocalDate;

		const cells = INSPECTOR_WATER_TEMPERATURE_SHIFT_SLOTS.map((slot) => {
			if (date === null) return buildCell({slot, date: null, status: 'na', check: null});
			const check = byIdentity.get(`${date}|${slot}`);
			if (check) return buildCell({slot, date, status: check.state, check});
			return buildCell({slot, date, status: isFuture ? 'future' : 'missing', check: null});
		});

		rows.push({day, dayLabel: ordinalDayLabel(day), date, existsInMonth, isFuture, cells});
	}

	return {
		houseName: args.data.houseName,
		year,
		month,
		monthLabel: inspectorMonthLabel(year, month),
		rows,
		summary: summarizeInspectorWaterTemperatureMonth(rows),
	};
}

function buildCell(args: {
	slot: InspectorShiftSlot;
	date: string | null;
	status: InspectorWaterTemperatureCellStatus;
	check: InspectorWaterTemperatureCheck | null;
}): InspectorWaterTemperatureCell {
	const {check} = args;
	const cell: InspectorWaterTemperatureCell = {
		slot: args.slot,
		slotLabel: SHIFT_SLOT_LABELS[args.slot],
		date: args.date,
		status: args.status,
		marker: inspectorCellMarker(args.status),
		check,
		kitchenTempF: check ? check.kitchenTempF : null,
		bathTempF: check ? check.bathTempF : null,
		initials: check ? check.staffInitials : '',
		belowRange: check ? check.kitchenTempF < 110 || check.bathTempF < 110 : false,
		aboveRange: check ? check.kitchenTempF > 115 || check.bathTempF > 115 : false,
		rechecks: check ? check.rechecks : [],
		description: '',
	};
	cell.description = describeInspectorWaterTemperatureCell(cell);
	return cell;
}

export function summarizeInspectorWaterTemperatureMonth(
	rows: readonly InspectorWaterTemperatureRow[]
): InspectorWaterTemperatureSummary {
	const summary: InspectorWaterTemperatureSummary = {
		validDays: 0,
		naDays: 0,
		obligationCount: 0,
		complete: 0,
		completeWithAttention: 0,
		actionRequired: 0,
		recheckRequired: 0,
		pending: 0,
		missing: 0,
		future: 0,
		naCells: 0,
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
					summary.pending += 1;
					break;
				case 'recheck_required':
					summary.recheckRequired += 1;
					summary.pending += 1;
					break;
				case 'missing':
					summary.missing += 1;
					break;
				case 'future':
					summary.future += 1;
					break;
			}
		}
	}

	return summary;
}

/** One sentence naming the cell's state for assistive technology, so the grid
 * never depends on the colour swatch. */
export function describeInspectorWaterTemperatureCell(
	cell: InspectorWaterTemperatureCell
): string {
	if (cell.status === 'na') return `${cell.slotLabel}: not a valid date in this month`;
	const where = `${cell.date}, ${cell.slotLabel}`;
	if (cell.status === 'future') return `${where}: not yet due`;
	if (cell.status === 'missing') return `${where}: missing — no water temperature recorded`;
	const readings =
		`${FIXTURE_LABELS.kitchen.toLowerCase()} ${formatInspectorTemperature(cell.kitchenTempF)}, ` +
		`${FIXTURE_LABELS.bath_shower.toLowerCase()} ${formatInspectorTemperature(cell.bathTempF)}`;
	const rechecks =
		cell.rechecks.length > 0
			? `, ${cell.rechecks.length} recheck${cell.rechecks.length === 1 ? '' : 's'} recorded`
			: '';
	return `${where}: ${cell.marker.label}, ${readings}, initials ${cell.initials}${rechecks}`;
}

// ============================================================================
// SHARED PRINT INPUT
// ============================================================================

/**
 * Feeds U5's `buildWaterTemperatureCheckLogHtml` from the inspector
 * projection. The supervisor workspace maps its DTO into the same structural
 * contract, so the same house/month prints byte-identically on both surfaces.
 */
export function toPrintableInspectorWaterTemperatureMonth(
	data: InspectorWaterTemperatureMonth
): PrintableWaterTemperatureMonth {
	return {
		houseName: data.houseName,
		year: data.year,
		month: data.month,
		checks: data.checks.map((check) => ({
			operationalDate: check.operationalDate,
			shiftSlot: check.shiftSlot,
			// The original observations, never a later safe recheck.
			kitchenTempF: check.kitchenTempF,
			bathTempF: check.bathTempF,
			staffInitials: check.staffInitials,
			comments: check.comments,
			action: check.action,
			state: check.state,
			rechecks: check.rechecks.map((recheck) => ({
				fixture: recheck.fixture,
				tempF: recheck.tempF,
				staffInitials: recheck.staffInitials,
				sequence: recheck.sequence,
				// The builder only tests this for truthiness to print
				// ", superseded". The inspector projection deliberately holds no
				// supersession timestamp, actor, or reason, so a marker stands in
				// and the printed sheet still matches the supervisor's exactly.
				supersededAt: recheck.superseded ? 'superseded' : null,
				voidedAt: null,
			})),
		})),
	};
}

// ============================================================================
// SCOPE READINESS
// ============================================================================

export type InspectorWaterTemperatureScope = {year: number; month: number};

export type InspectorWaterTemperatureLoadState = 'idle' | 'loading' | 'ready' | 'error';

export function isValidInspectorMonthSelection(year: number, month: number): boolean {
	return isValidInspectorReportYear(year) && isValidInspectorReportMonth(month);
}

export function sameInspectorWaterTemperatureScope(
	left: InspectorWaterTemperatureScope | null | undefined,
	right: InspectorWaterTemperatureScope | null | undefined
): boolean {
	return Boolean(left && right && left.year === right.year && left.month === right.month);
}

/** Records are only "ready" when the loaded month still matches the selected
 * one, so a slow response for a previous month can never be shown as the
 * current one. */
export function isInspectorWaterTemperatureReady(args: {
	currentScope: InspectorWaterTemperatureScope | null;
	loadedScope: InspectorWaterTemperatureScope | null;
	state: InspectorWaterTemperatureLoadState;
}): boolean {
	return (
		args.state === 'ready' &&
		sameInspectorWaterTemperatureScope(args.currentScope, args.loadedScope)
	);
}

/** The ONLY client-controlled inputs on this endpoint. No house, location, or
 * scope parameter is ever produced here. */
export function inspectorWaterTemperatureQuery(scope: InspectorWaterTemperatureScope): string {
	return new URLSearchParams({
		year: String(scope.year),
		month: String(scope.month),
	}).toString();
}

/** Organization-local-ish "today" for the future/missing boundary. The panel
 * is a read-only view, so the browser's local date is presentation-only and
 * never changes a stored fact. */
export function inspectorLocalToday(now: Date = new Date()): string {
	return toInspectorOperationalDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export type {
	InspectorWaterTemperatureCheck,
	InspectorWaterTemperatureMonth,
	InspectorWaterTemperatureRecheck,
};
