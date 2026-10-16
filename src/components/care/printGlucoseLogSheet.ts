// src/components/care/printGlucoseLogSheet.ts
//
// Pure builder + print trigger for the monthly BLOOD GLUCOSE LOG: one row per
// check, oldest first, with what was done about critical readings and
// who reviewed them. Letter landscape so the action column has room.

import {escapePrintHtml, printDocument} from '../shared/printDocument';
import {
	ACTION_LABELS,
	CHECK_METHOD_LABELS,
	CHECK_TYPE_LABELS,
	GLUCOSE_STATUS_LABELS,
	SYMPTOM_LABELS,
	formatGlucoseReading,
	isCritical,
	type GlucoseAction,
	type GlucoseCheckMethod,
	type GlucoseCheckType,
	type GlucoseStatus,
	type GlucoseSymptom,
	type GlucoseThresholds,
	type GlucoseUnit,
} from '@/lib/blood-glucose';

const LOGO_URL = '/el-elyon-logo.svg';

export interface GlucoseSheetEntry {
	checkedAt: string;
	checkType: GlucoseCheckType;
	method: GlucoseCheckMethod;
	refused: boolean;
	refusalReason: string | null;
	readingValue: number | null;
	readingUnit: GlucoseUnit;
	status: GlucoseStatus;
	symptoms: GlucoseSymptom[];
	actionsTaken: GlucoseAction[];
	notifiedWho: string | null;
	insulinGiven: boolean;
	insulinType: string | null;
	insulinUnits: number | null;
	notes: string | null;
	staffNameSnapshot: string;
	updatedAt: string | null;
	reviewedAt: string | null;
	reviewedByName: string | null;
}

export interface GlucoseSheetInput {
	residentName: string;
	monthLabel: string;
	thresholds: GlucoseThresholds;
	entries: GlucoseSheetEntry[];
	/** Formats instants for the sheet; injectable so tests do not depend on the host timezone. */
	formatDateTime?: (iso: string) => {date: string; time: string};
}

function defaultFormat(iso: string) {
	const d = new Date(iso);
	return {
		date: d.toLocaleDateString(undefined, {month: 'short', day: 'numeric'}),
		time: d.toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'}),
	};
}

export function buildGlucoseLogSheetHtml(input: GlucoseSheetInput): string {
	const format = input.formatDateTime ?? defaultFormat;
	const sorted = [...input.entries].sort((a, b) => a.checkedAt.localeCompare(b.checkedAt));
	const t = input.thresholds;

	const rows = sorted
		.map((e) => {
			const {date, time} = format(e.checkedAt);
			const flagged = isCritical(e.status);
			const details = [
				e.refused && e.refusalReason ? `Not done: ${e.refusalReason}` : '',
				e.symptoms.length ? `Symptoms: ${e.symptoms.map((s) => SYMPTOM_LABELS[s]).join(', ')}` : '',
				e.actionsTaken.length
					? `Done: ${e.actionsTaken.map((a) => ACTION_LABELS[a]).join(', ')}`
					: '',
				e.notifiedWho ? `Notified: ${e.notifiedWho}` : '',
				e.notes ? `Notes: ${e.notes}` : '',
			]
				.filter(Boolean)
				.map((line) => `<span class="line">${escapePrintHtml(line)}</span>`)
				.join('');
			const insulin = e.insulinGiven
				? `${escapePrintHtml(String(e.insulinUnits ?? ''))} u ${escapePrintHtml(e.insulinType ?? '')}`
				: '';
			const reviewed = e.reviewedAt
				? `${escapePrintHtml(e.reviewedByName ?? '')}<span class="sub">${escapePrintHtml(
						format(e.reviewedAt).date
					)}</span>`
				: '';
			return `<tr class="${flagged ? 'flag' : ''}">
				<td class="nowrap">${escapePrintHtml(date)}<span class="sub">${escapePrintHtml(time)}</span></td>
				<td>${escapePrintHtml(CHECK_TYPE_LABELS[e.checkType])}<span class="sub">${escapePrintHtml(
					CHECK_METHOD_LABELS[e.method]
				)}</span></td>
				<td class="reading">${escapePrintHtml(formatGlucoseReading(e))}</td>
				<td class="status">${escapePrintHtml(GLUCOSE_STATUS_LABELS[e.status])}</td>
				<td>${details}</td>
				<td>${insulin}</td>
				<td>${escapePrintHtml(e.staffNameSnapshot)}${e.updatedAt ? '<span class="sub">edited</span>' : ''}</td>
				<td>${reviewed}</td>
			</tr>`;
		})
		.join('');

	const body = rows || '<tr><td colspan="8" class="empty">No checks logged this month.</td></tr>';

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Blood Glucose Log</title>
	<style>
		@page { size: Letter landscape; margin: 10mm; }
		* { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; color: #111; background: #fff; font-family: Arial, Helvetica, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
		.brand-header { text-align: center; }
		.brand-header img { height: 16mm; width: auto; }
		h1 { margin: 1.5mm 0 0; text-align: center; font-size: 13pt; letter-spacing: 0.3pt; }
		.meta { display: flex; justify-content: space-between; gap: 6mm; margin: 3mm 0 2mm; font-size: 9pt; }
		.meta span { display: inline-block; min-width: 40mm; padding: 0 1.5mm; border-bottom: 0.3mm solid #333; }
		table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 7.5pt; }
		th, td { border: 0.25mm solid #444; padding: 0.8mm 1mm; vertical-align: top; overflow-wrap: anywhere; }
		thead th { background: #eee; font-weight: 700; text-align: left; }
		thead { display: table-header-group; }
		tbody tr { break-inside: avoid; page-break-inside: avoid; }
		tr.flag td { background: #fdecea; }
		.nowrap { white-space: nowrap; }
		.sub { display: block; font-size: 6.5pt; color: #444; }
		.line { display: block; }
		.reading { font-weight: 700; }
		.status { font-weight: 700; }
		.empty { text-align: center; padding: 6mm; color: #555; }
		col.c-date { width: 18mm; } col.c-type { width: 26mm; } col.c-reading { width: 22mm; }
		col.c-status { width: 18mm; } col.c-insulin { width: 26mm; } col.c-staff { width: 28mm; } col.c-review { width: 26mm; }
		.footer { margin-top: 3mm; font-size: 7pt; color: #444; }
	</style>
</head>
<body>
	<div class="brand-header"><img src="${LOGO_URL}" alt="El Elyon Supported Living Homes" /></div>
	<h1>BLOOD GLUCOSE LOG</h1>
	<div class="meta">
		<div>RESIDENT: <span>${escapePrintHtml(input.residentName)}</span></div>
		<div>MONTH: <span>${escapePrintHtml(input.monthLabel)}</span></div>
		<div>CRITICAL: <span>below ${t.criticalLow} / above ${t.criticalHigh} mg/dL</span></div>
	</div>
	<table>
		<colgroup>
			<col class="c-date" /><col class="c-type" /><col class="c-reading" /><col class="c-status" />
			<col /><col class="c-insulin" /><col class="c-staff" /><col class="c-review" />
		</colgroup>
		<thead><tr><th>Date / time</th><th>Check</th><th>Reading</th><th>Status</th><th>Symptoms and action taken</th><th>Insulin</th><th>Staff</th><th>Reviewed by</th></tr></thead>
		<tbody>${body}</tbody>
	</table>
	<p class="footer">Shaded rows were critical readings. Limits shown are the resident's current limits; each entry was classified against the limits in place when it was logged.</p>
</body>
</html>`;
}

export async function printGlucoseLogSheet(input: GlucoseSheetInput): Promise<boolean> {
	return printDocument(buildGlucoseLogSheetHtml(input));
}
