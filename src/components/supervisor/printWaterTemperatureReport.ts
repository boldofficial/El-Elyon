// src/components/supervisor/printWaterTemperatureReport.ts
//
// Pure builder for the DAILY WATER TEMPERATURE CHECK LOG, reproducing the
// supplied paper form: Letter landscape, one page, 31 ordinal day rows, and
// 11 logical columns grouped into DATE / 1ST / 2ND / 3RD SHIFT / COMMENTS.
//
// The input types below are deliberately structural and minimal. They are
// satisfied by the supervisor DTO (db/queries/water-temperature.ts) AND by
// U6's inspector projection, so an inspector-scoped read model can feed this
// same renderer without this module importing any supervisor-only mutation,
// authorization, or revision code.

import {
	escapePrintHtml,
	printDocument,
	type PrintDocumentOptions,
} from '../shared/printDocument';
import {ABOVE_115_ESCALATION_INSTRUCTIONS} from '../care/waterTemperatureEntryModel';

const ORGANIZATION_NAME = 'EL ELYON PROPERTIES LLC';
const LOGO_URL = '/logo.svg';

// ============================================================================
// FORM COPY (transcribed from the supplied photograph)
// ============================================================================

export const WATER_TEMPERATURE_REPORT_TITLE = 'DAILY WATER TEMPERATURE CHECK LOG';
export const WATER_TEMPERATURE_SAFE_RANGE_LEAD = 'SAFE WATER TEMPERATURE:';
export const WATER_TEMPERATURE_SAFE_RANGE_VALUE = '110°F - 115°F';
export const WATER_TEMPERATURE_SHIFT_INSTRUCTION =
	'Check and document water temperatures at the beginning of each shift.';
export const WATER_TEMPERATURE_MONTH_FIELD_LABEL = 'MONTH:';

/** Re-exported so the report footer and every U4 staff surface stay one
 * edit apart. The final sentence was reconstructed from a photograph whose
 * right edge was cut off; correcting it must remain a one-line change in
 * src/components/care/waterTemperatureEntryModel.ts. */
export {ABOVE_115_ESCALATION_INSTRUCTIONS};

export const WATER_TEMPERATURE_SHIFT_GROUP_HEADERS = [
	'1ST SHIFT',
	'2ND SHIFT',
	'3RD SHIFT',
] as const;

export const WATER_TEMPERATURE_SHIFT_SUB_HEADERS = [
	'KITCHEN (°F)',
	'BATH / SHOWER (°F)',
	'INITIALS',
] as const;

export const WATER_TEMPERATURE_DATE_HEADER = 'DATE';
export const WATER_TEMPERATURE_COMMENTS_HEADER = 'COMMENTS / NOTES / ACTION TAKEN';

/** The 11 logical columns, in printed order. Exported so tests (and U6) can
 * assert the column contract without re-deriving it from the markup. */
export const WATER_TEMPERATURE_LOGICAL_COLUMNS: readonly string[] = [
	WATER_TEMPERATURE_DATE_HEADER,
	...WATER_TEMPERATURE_SHIFT_GROUP_HEADERS.flatMap((group) =>
		WATER_TEMPERATURE_SHIFT_SUB_HEADERS.map((sub) => `${group} — ${sub}`)
	),
	WATER_TEMPERATURE_COMMENTS_HEADER,
];

export const WATER_TEMPERATURE_ROW_COUNT = 31;

const MONTH_LABELS = [
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
];

const FIXTURE_PRINT_LABELS: Record<PrintableWaterTemperatureFixture, string> = {
	kitchen: 'Kitchen',
	bath_shower: 'Bath/Shower',
};

const SLOT_PREFIXES: Record<1 | 2 | 3, string> = {1: '1st', 2: '2nd', 3: '3rd'};

// One page is a hard requirement, so comment text is bounded deterministically
// rather than allowed to reflow the sheet. Thirty-one rows on Letter landscape
// leave the comments cell two printed lines of roughly 148 characters each at
// the sheet's column width, hence a 290-character cell budget shared evenly
// between the shifts that have something to say. The cell is `overflow:
// hidden` as a final backstop; the digital record always retains the
// untruncated narrative.
const MAX_SLOT_COMMENT_CHARS = 290;
const MIN_SLOT_COMMENT_CHARS = 60;
const MAX_CELL_COMMENT_CHARS = 290;
const SLOT_SEPARATOR = ' | ';
const TRUNCATION_MARKER = '…';

// ============================================================================
// INPUT CONTRACT
// ============================================================================

export type PrintableWaterTemperatureFixture = 'kitchen' | 'bath_shower';

export type PrintableWaterTemperatureState =
	| 'complete'
	| 'complete_with_attention'
	| 'action_required'
	| 'recheck_required';

export interface PrintableWaterTemperatureRecheck {
	fixture: PrintableWaterTemperatureFixture;
	tempF: number;
	/** Initials only. Full staff names never reach the printed sheet. */
	staffInitials: string;
	sequence: number;
	supersededAt?: string | null;
	voidedAt?: string | null;
}

export interface PrintableWaterTemperatureCheck {
	operationalDate: string;
	shiftSlot: 1 | 2 | 3;
	/** The ORIGINAL observations. A later safe recheck must never be
	 * substituted here (R7): a fixture that read 118.0 prints 118.0. */
	kitchenTempF: number;
	bathTempF: number;
	staffInitials: string;
	comments?: string | null;
	action?: string | null;
	state: PrintableWaterTemperatureState;
	rechecks?: readonly PrintableWaterTemperatureRecheck[];
}

export interface PrintableWaterTemperatureMonth {
	houseName: string;
	year: number;
	/** 1-12. */
	month: number;
	checks: readonly PrintableWaterTemperatureCheck[];
}

// ============================================================================
// BUILDER
// ============================================================================

export function buildWaterTemperatureCheckLogHtml(
	report: PrintableWaterTemperatureMonth
): string {
	validateReport(report);

	const byIdentity = new Map<string, PrintableWaterTemperatureCheck>();
	for (const check of report.checks) {
		byIdentity.set(`${check.operationalDate}|${check.shiftSlot}`, check);
	}

	const length = daysInMonth(report.year, report.month);
	const rows: string[] = [];

	for (let day = 1; day <= WATER_TEMPERATURE_ROW_COUNT; day += 1) {
		const label = escapePrintHtml(ordinalDayLabel(day));
		if (day > length) {
			// Nonexistent calendar days are explicitly N/A, never blank-and-
			// therefore-missing (R14/AE9).
			const na = '<td class="na">N/A</td>';
			rows.push(
				`<tr class="na-row"><th scope="row">${label}</th>${na.repeat(9)}<td class="comments na">N/A</td></tr>`
			);
			continue;
		}

		const date = operationalDate(report.year, report.month, day);
		const slotCells: string[] = [];
		const commentSegments: SlotComment[] = [];

		for (const slot of [1, 2, 3] as const) {
			const check = byIdentity.get(`${date}|${slot}`);
			slotCells.push(
				`<td class="temp shift-${slot} group-start">${check ? escapePrintHtml(formatTemperature(check.kitchenTempF)) : ''}</td>` +
					`<td class="temp shift-${slot}">${check ? escapePrintHtml(formatTemperature(check.bathTempF)) : ''}</td>` +
					`<td class="initials shift-${slot}">${check ? escapePrintHtml(check.staffInitials) : ''}</td>`
			);
			const segment = buildSlotComment(check);
			if (segment) commentSegments.push({slot, text: segment});
		}

		rows.push(
			`<tr><th scope="row">${label}</th>${slotCells.join('')}` +
				`<td class="comments">${escapePrintHtml(buildCommentsCellText(commentSegments))}</td></tr>`
		);
	}

	const monthLabel = `${MONTH_LABELS[report.month - 1]} ${report.year}`;

	return documentShell({
		title: `Daily Water Temperature Check Log — ${report.houseName} — ${monthLabel}`,
		body: `<main class="log-page">
			<header class="brand-header"><img src="${LOGO_URL}" alt="" /><div>${ORGANIZATION_NAME}</div></header>
			<h1>${escapePrintHtml(WATER_TEMPERATURE_REPORT_TITLE)}</h1>
			<p class="safe-range">${escapePrintHtml(WATER_TEMPERATURE_SAFE_RANGE_LEAD)} <span class="range">${escapePrintHtml(WATER_TEMPERATURE_SAFE_RANGE_VALUE)}</span></p>
			<p class="instruction">${escapePrintHtml(WATER_TEMPERATURE_SHIFT_INSTRUCTION)}</p>
			<div class="meta">
				<div class="month-field"><strong>${escapePrintHtml(WATER_TEMPERATURE_MONTH_FIELD_LABEL)}</strong> <span>${escapePrintHtml(monthLabel)}</span></div>
				<div class="house-field"><strong>HOUSE:</strong> <span>${escapePrintHtml(report.houseName)}</span></div>
			</div>
			<table class="log-table" aria-label="${escapePrintHtml(WATER_TEMPERATURE_REPORT_TITLE)}">
				<colgroup>
					<col class="col-date" />
					${[1, 2, 3]
						.map(
							() =>
								'<col class="col-kitchen" /><col class="col-bath" /><col class="col-initials" />'
						)
						.join('')}
					<col class="col-comments" />
				</colgroup>
				<thead>
					<tr class="group-row">
						<th rowspan="2" class="head-date">${escapePrintHtml(WATER_TEMPERATURE_DATE_HEADER)}</th>
						${WATER_TEMPERATURE_SHIFT_GROUP_HEADERS.map(
							(group, index) =>
								`<th colspan="3" class="head-shift shift-${index + 1} group-start">${escapePrintHtml(group)}</th>`
						).join('')}
						<th rowspan="2" class="head-comments">${escapePrintHtml(WATER_TEMPERATURE_COMMENTS_HEADER)}</th>
					</tr>
					<tr class="sub-row">
						${WATER_TEMPERATURE_SHIFT_GROUP_HEADERS.map((_group, index) =>
							WATER_TEMPERATURE_SHIFT_SUB_HEADERS.map(
								(sub, position) =>
									`<th class="shift-${index + 1}${position === 0 ? ' group-start' : ''}">${escapePrintHtml(sub)}</th>`
							).join('')
						).join('')}
					</tr>
				</thead>
				<tbody>${rows.join('')}</tbody>
			</table>
			<footer class="escalation">${escalationFooterHtml()}</footer>
		</main>`,
	});
}

export function printWaterTemperatureCheckLog(
	report: PrintableWaterTemperatureMonth,
	options?: PrintDocumentOptions
): Promise<boolean> {
	return printDocument(buildWaterTemperatureCheckLogHtml(report), options);
}

// ============================================================================
// COMMENT COMPOSITION
// ============================================================================

/**
 * Deterministic per-shift narrative: out-of-range flags first (so the reason
 * the row matters is never buried), then the staff comment, the documented
 * action, every ordered recheck, and finally what is still outstanding.
 *
 * Recheck actors appear as INITIALS only -- the printed sheet and the
 * inspector projection never carry full staff names (R15).
 */
export function buildSlotComment(
	check: PrintableWaterTemperatureCheck | undefined
): string {
	if (!check) return '';
	const parts: string[] = [];

	for (const [fixture, value] of [
		['kitchen', check.kitchenTempF],
		['bath_shower', check.bathTempF],
	] as const) {
		if (value > 115) {
			parts.push(`${FIXTURE_PRINT_LABELS[fixture]} ${formatTemperature(value)} above 115°F`);
		} else if (value < 110) {
			parts.push(`${FIXTURE_PRINT_LABELS[fixture]} ${formatTemperature(value)} below 110°F`);
		}
	}

	const comments = normalizeNarrative(check.comments);
	if (comments) parts.push(comments);

	const action = normalizeNarrative(check.action);
	if (action) parts.push(`Action: ${action}`);

	for (const recheck of orderedRechecks(check)) {
		const superseded = recheck.supersededAt || recheck.voidedAt ? ', superseded' : '';
		parts.push(
			`Recheck ${FIXTURE_PRINT_LABELS[recheck.fixture]} ${formatTemperature(recheck.tempF)} ` +
				`(${normalizeNarrative(recheck.staffInitials) || '—'}${superseded})`
		);
	}

	if (check.state === 'action_required') parts.push('Pending: corrective action');
	if (check.state === 'recheck_required') parts.push('Pending: safe recheck');

	return parts.join('; ');
}

export type SlotComment = {slot: 1 | 2 | 3; text: string};

/**
 * Combines the day's shift narratives into the single COMMENTS / NOTES /
 * ACTION TAKEN cell, prefixed `1st:` / `2nd:` / `3rd:` in slot order.
 *
 * The cell is two printed lines tall, so the budget is shared evenly between
 * the shifts that actually have something to say: one busy shift may use the
 * whole cell, three busy shifts get an equal share each. Truncation is
 * deterministic and always visibly marked; the untruncated narrative remains
 * in the digital record.
 */
export function buildCommentsCellText(segments: readonly SlotComment[]): string {
	if (segments.length === 0) return '';
	const separatorCost = (segments.length - 1) * SLOT_SEPARATOR.length;
	const budget = Math.max(
		MIN_SLOT_COMMENT_CHARS,
		Math.min(
			MAX_SLOT_COMMENT_CHARS,
			Math.floor((MAX_CELL_COMMENT_CHARS - separatorCost) / segments.length)
		)
	);
	const rendered = segments.map((segment) => {
		const prefix = `${SLOT_PREFIXES[segment.slot]}: `;
		return `${prefix}${truncate(segment.text, Math.max(1, budget - prefix.length))}`;
	});
	return truncate(rendered.join(SLOT_SEPARATOR), MAX_CELL_COMMENT_CHARS);
}

function orderedRechecks(
	check: PrintableWaterTemperatureCheck
): PrintableWaterTemperatureRecheck[] {
	return (check.rechecks ?? [])
		.slice()
		.sort((left, right) => left.sequence - right.sequence);
}

/** Collapses newlines and runs of whitespace so a multi-line note cannot
 * silently consume the fixed-height comments cell. */
function normalizeNarrative(value: string | null | undefined): string {
	if (typeof value !== 'string') return '';
	return value.replace(/\s+/g, ' ').trim();
}

function truncate(value: string, maximum: number): string {
	if (value.length <= maximum) return value;
	const clipped = value.slice(0, maximum - 1);
	const boundary = clipped.lastIndexOf(' ');
	const base = boundary > maximum * 0.6 ? clipped.slice(0, boundary) : clipped;
	return `${base.trimEnd()}${TRUNCATION_MARKER}`;
}

function escalationFooterHtml(): string {
	const separator = ABOVE_115_ESCALATION_INSTRUCTIONS.indexOf(':');
	if (separator === -1) return escapePrintHtml(ABOVE_115_ESCALATION_INSTRUCTIONS);
	const lead = ABOVE_115_ESCALATION_INSTRUCTIONS.slice(0, separator + 1);
	const rest = ABOVE_115_ESCALATION_INSTRUCTIONS.slice(separator + 1).trimStart();
	return `<strong>${escapePrintHtml(lead)}</strong> ${escapePrintHtml(rest)}`;
}

// ============================================================================
// FORMATTING + CALENDAR HELPERS
// ============================================================================

export function formatTemperature(value: number): string {
	return `${value.toFixed(1)}`;
}

export function daysInMonth(year: number, month: number): number {
	return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function operationalDate(year: number, month: number, day: number): string {
	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

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
// VALIDATION
// ============================================================================

const MAX_CHECKS = WATER_TEMPERATURE_ROW_COUNT * 3;
const MAX_RECHECKS_PER_CHECK = 50;
const MAX_NARRATIVE = 2_000;
const VALID_STATES: readonly string[] = [
	'complete',
	'complete_with_attention',
	'action_required',
	'recheck_required',
];

function validateReport(report: PrintableWaterTemperatureMonth): void {
	validateText(report.houseName, 255, 'House name');
	if (!Number.isInteger(report.year) || report.year < 2020 || report.year > 2100) {
		throw new TypeError('Report year must be between 2020 and 2100');
	}
	if (!Number.isInteger(report.month) || report.month < 1 || report.month > 12) {
		throw new TypeError('Report month must be between 1 and 12');
	}
	if (!Array.isArray(report.checks) || report.checks.length > MAX_CHECKS) {
		throw new TypeError(`Water temperature logs may contain at most ${MAX_CHECKS} records`);
	}

	const length = daysInMonth(report.year, report.month);
	const identities = new Set<string>();
	for (const check of report.checks) {
		if (check.shiftSlot !== 1 && check.shiftSlot !== 2 && check.shiftSlot !== 3) {
			throw new TypeError('Shift slot must be 1, 2, or 3');
		}
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(check.operationalDate ?? '');
		if (!match) throw new TypeError('Operational date must be a YYYY-MM-DD local date');
		const day = Number(match[3]);
		if (
			Number(match[1]) !== report.year ||
			Number(match[2]) !== report.month ||
			day < 1 ||
			day > length
		) {
			throw new TypeError('Operational date must fall inside the reported month');
		}
		const identity = `${check.operationalDate}|${check.shiftSlot}`;
		if (identities.has(identity)) {
			throw new TypeError('Duplicate water temperature record for one date and shift');
		}
		identities.add(identity);

		validateReading(check.kitchenTempF, 'Kitchen temperature');
		validateReading(check.bathTempF, 'Bath/shower temperature');
		validateText(check.staffInitials, 50, 'Staff initials');
		if (!VALID_STATES.includes(check.state)) {
			throw new TypeError('Unsupported water temperature state');
		}
		if (check.comments !== null && check.comments !== undefined) {
			validateText(check.comments, MAX_NARRATIVE, 'Comments', true);
		}
		if (check.action !== null && check.action !== undefined) {
			validateText(check.action, MAX_NARRATIVE, 'Action taken', true);
		}

		const rechecks = check.rechecks ?? [];
		if (!Array.isArray(rechecks) || rechecks.length > MAX_RECHECKS_PER_CHECK) {
			throw new TypeError(
				`A water temperature record may contain at most ${MAX_RECHECKS_PER_CHECK} rechecks`
			);
		}
		for (const recheck of rechecks) {
			if (recheck.fixture !== 'kitchen' && recheck.fixture !== 'bath_shower') {
				throw new TypeError('Recheck fixture must be kitchen or bath_shower');
			}
			validateReading(recheck.tempF, 'Recheck temperature');
			validateText(recheck.staffInitials, 50, 'Recheck initials');
			if (!Number.isInteger(recheck.sequence) || recheck.sequence < 1) {
				throw new TypeError('Recheck sequence must be a positive integer');
			}
		}
	}
}

function validateReading(value: unknown, label: string): asserts value is number {
	if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 250) {
		throw new TypeError(`${label} must be a number between 0 and 250`);
	}
}

function validateText(
	value: unknown,
	maximum: number,
	label: string,
	allowEmpty = false
): asserts value is string {
	if (
		typeof value !== 'string' ||
		(!allowEmpty && value.trim().length === 0) ||
		value.length > maximum
	) {
		throw new TypeError(
			`${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${maximum} characters`
		);
	}
}

// ============================================================================
// DOCUMENT SHELL
//
// Mirrors printLifeSafetyReports.ts's shell (locked-down CSP, no remote
// resources, escaped title) but pins Letter LANDSCAPE and a fixed-height
// single page. Group tints must survive printing, so print-colour adjustment
// is forced both globally and on the tinted cells themselves.
// ============================================================================

function documentShell(args: {title: string; body: string}): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${escapePrintHtml(args.title)}</title>
	<style>
		@page { size: Letter landscape; margin: 0; }
		* { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; color: #111; background: #fff; font-family: Arial, Helvetica, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
		table { border-collapse: collapse; width: 100%; table-layout: fixed; }
		th, td { overflow-wrap: anywhere; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
		/* Exactly one Letter-landscape page: the sheet is sized to the paper
		   and clips rather than reflowing onto a second page. The vertical
		   budget is 8.5in minus 6mm padding = ~210mm: ~22mm masthead, ~7mm
		   escalation footer, 9.5mm of table headers, and 31 body rows of
		   5.5mm (170.5mm). */
		.log-page { width: 11in; height: 8.5in; padding: 3mm 5mm; overflow: hidden; break-after: avoid; page-break-after: avoid; }
		.brand-header { display: flex; align-items: center; justify-content: center; gap: 2mm; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 8pt; }
		.brand-header img { width: 5mm; height: 5mm; object-fit: contain; }
		h1 { margin: 0.8mm 0 0; text-align: center; font-size: 11pt; letter-spacing: 0.3pt; }
		.safe-range { margin: 0.7mm 0 0; text-align: center; font-size: 8pt; font-weight: 700; }
		.safe-range .range { color: #c0392b; }
		.instruction { margin: 0.5mm 0 0; text-align: center; font-size: 6.5pt; font-style: italic; }
		.meta { display: flex; justify-content: space-between; align-items: flex-end; margin: 1.4mm 0 1mm; font-size: 7pt; }
		.meta span { display: inline-block; min-width: 40mm; padding: 0 1.5mm; border-bottom: 0.3mm solid #333; }
		.log-table { font-size: 6pt; }
		.log-table th, .log-table td { border: 0.25mm solid #444; text-align: center; vertical-align: middle; padding: 0 0.6mm; }
		.log-table thead th { font-weight: 700; }
		.log-table .group-row th { height: 4mm; font-size: 7pt; }
		.log-table .sub-row th { height: 5.5mm; font-size: 5.5pt; line-height: 1.05; }
		.log-table tbody tr { height: 5.5mm; break-inside: avoid; page-break-inside: avoid; }
		.log-table tbody th { text-align: center; font-weight: 700; font-size: 6.5pt; background: #f2f2f2; }
		/* The 11 logical columns, fixed so no cell content can resize them. */
		col.col-date { width: 5%; }
		col.col-kitchen { width: 5.5%; }
		col.col-bath { width: 6%; }
		col.col-initials { width: 4%; }
		col.col-comments { width: 48.5%; }
		.log-table .head-date { background: #c9daf8; }
		.log-table .head-comments { background: #fce5cd; }
		.log-table thead .shift-1 { background: #d9ead3; }
		.log-table thead .shift-2 { background: #fff2cc; }
		.log-table thead .shift-3 { background: #f9cb9c; }
		.log-table .group-start { border-left: 0.5mm solid #222; }
		.log-table td.temp { font-size: 6.5pt; }
		.log-table td.initials { font-size: 6pt; }
		/* Fixed-height, clipped comments: bounded by MAX_SLOT_COMMENT_CHARS
		   per shift and MAX_CELL_COMMENT_CHARS per cell, with overflow hidden
		   as the backstop so a worst-case month cannot spill onto a second
		   page. */
		.log-table td.comments { text-align: left; vertical-align: top; font-size: 5pt; line-height: 1.04; padding: 0.3mm 0.8mm; overflow: hidden; }
		.log-table td.na, .log-table tr.na-row th { color: #777; background: #f7f7f7; font-style: italic; }
		.escalation { margin-top: 1.4mm; padding: 0.8mm 1.5mm; border: 0.3mm solid #c0392b; font-size: 5.4pt; line-height: 1.2; text-align: left; }
		@media print { html, body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
	</style>
</head>
<body class="water-temperature-document">${args.body}</body>
</html>`;
}
