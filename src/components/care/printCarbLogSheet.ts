// src/components/care/printCarbLogSheet.ts
//
// Pure builder + print trigger for the monthly CARBOHYDRATE INTAKE LOG: one
// row per calendar day, one column per meal (snacks are summed), plus a daily
// total. Letter portrait; 31 rows fit on one page.

import {escapePrintHtml, printDocument} from '../shared/printDocument';
import {MEAL_SLOT_LABELS, type MealSlot} from '@/lib/carb-log';

const ORGANIZATION_NAME = 'EL ELYON PROPERTIES LLC';
const LOGO_URL = '/logo.svg';
const COLUMNS: MealSlot[] = ['breakfast', 'lunch', 'dinner', 'snack'];

export interface CarbLogSheetEntry {
	operationalDate: string;
	mealSlot: MealSlot;
	carbsGrams: number;
	foodDescription: string | null;
	staffNameSnapshot: string;
}

export interface CarbLogSheetInput {
	residentName: string;
	monthLabel: string;
	/** Inclusive YYYY-MM-DD range; every day in it becomes a row. */
	from: string;
	to: string;
	entries: CarbLogSheetEntry[];
}

function eachDate(from: string, to: string): string[] {
	const dates: string[] = [];
	const [fy, fm, fd] = from.split('-').map(Number);
	const [ty, tm, td] = to.split('-').map(Number);
	const cursor = new Date(Date.UTC(fy, fm - 1, fd));
	const end = new Date(Date.UTC(ty, tm - 1, td));
	while (cursor <= end) {
		dates.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return dates;
}

export function buildCarbLogSheetHtml(input: CarbLogSheetInput): string {
	const byDate = new Map<string, CarbLogSheetEntry[]>();
	for (const entry of input.entries) {
		const list = byDate.get(entry.operationalDate) ?? [];
		list.push(entry);
		byDate.set(entry.operationalDate, list);
	}

	const rows = eachDate(input.from, input.to)
		.map((date) => {
			const dayEntries = byDate.get(date) ?? [];
			const cells = COLUMNS.map((slot) => {
				const matching = dayEntries.filter((e) => e.mealSlot === slot);
				if (matching.length === 0) return '<td></td>';
				const grams = matching.reduce((sum, e) => sum + e.carbsGrams, 0);
				const food = matching
					.map((e) => e.foodDescription)
					.filter(Boolean)
					.join('; ');
				return `<td><span class="g">${grams}g</span>${
					food ? `<span class="food">${escapePrintHtml(food)}</span>` : ''
				}</td>`;
			}).join('');
			const total = dayEntries.reduce((sum, e) => sum + e.carbsGrams, 0);
			const initials = Array.from(
				new Set(dayEntries.map((e) => e.staffNameSnapshot))
			).join(', ');
			return `<tr><td class="date">${escapePrintHtml(date.slice(8))}</td>${cells}<td class="total">${
				dayEntries.length ? `${total}g` : ''
			}</td><td class="staff">${escapePrintHtml(initials)}</td></tr>`;
		})
		.join('');

	const headers = COLUMNS.map((slot) => `<th>${MEAL_SLOT_LABELS[slot]}</th>`).join('');

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Carbohydrate Intake Log</title>
	<style>
		@page { size: Letter portrait; margin: 10mm; }
		* { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; color: #111; background: #fff; font-family: Arial, Helvetica, sans-serif; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
		.brand-header { display: flex; align-items: center; justify-content: center; gap: 2mm; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 9pt; }
		.brand-header img { width: 6mm; height: 6mm; object-fit: contain; }
		h1 { margin: 1.5mm 0 0; text-align: center; font-size: 13pt; letter-spacing: 0.3pt; }
		.meta { display: flex; justify-content: space-between; margin: 3mm 0 2mm; font-size: 9pt; }
		.meta span { display: inline-block; min-width: 50mm; padding: 0 1.5mm; border-bottom: 0.3mm solid #333; }
		table { border-collapse: collapse; width: 100%; table-layout: fixed; font-size: 7.5pt; }
		th, td { border: 0.25mm solid #444; padding: 0.6mm 1mm; vertical-align: top; overflow-wrap: anywhere; }
		thead th { background: #eee; font-weight: 700; text-align: center; height: 6mm; }
		tbody tr { height: 6.6mm; break-inside: avoid; page-break-inside: avoid; }
		td.date { width: 8mm; text-align: center; font-weight: 700; }
		td.total { width: 14mm; text-align: center; font-weight: 700; }
		td.staff { width: 28mm; font-size: 6.5pt; }
		.g { display: block; font-weight: 700; }
		.food { display: block; font-size: 6.5pt; color: #333; }
		.footer { margin-top: 3mm; font-size: 7pt; color: #444; }
	</style>
</head>
<body>
	<div class="brand-header"><img src="${LOGO_URL}" alt="" /><span>${escapePrintHtml(ORGANIZATION_NAME)}</span></div>
	<h1>CARBOHYDRATE INTAKE LOG</h1>
	<div class="meta">
		<div>RESIDENT: <span>${escapePrintHtml(input.residentName)}</span></div>
		<div>MONTH: <span>${escapePrintHtml(input.monthLabel)}</span></div>
	</div>
	<table>
		<thead><tr><th>Day</th>${headers}<th>Total</th><th>Staff</th></tr></thead>
		<tbody>${rows}</tbody>
	</table>
	<p class="footer">Carbohydrates recorded in grams per meal. Snack column totals all snacks logged that day.</p>
</body>
</html>`;
}

export async function printCarbLogSheet(input: CarbLogSheetInput): Promise<boolean> {
	return printDocument(buildCarbLogSheetHtml(input));
}
