// src/components/care/printCareLogReport.ts
//
// Pure builder + print trigger for the RESIDENT ACTIVITY LOG REPORT: every
// activity log for one location over a date range, for sending to state
// inspectors (print, or "Save as PDF" from the print dialog).
//
// The header states the period and total entry count, and the last line
// repeats the count, so a reader can tell the printout is complete.

import {escapePrintHtml, printDocument} from '../shared/printDocument';
import {formatLogContent} from './SharedLogsTable';
import type {CareLogReport, CareLogReportEntry} from '@/lib/care-log-report';

const ORGANIZATION_NAME = 'EL ELYON PROPERTIES LLC';
const LOGO_URL = '/logo.svg';

export interface CareLogReportSection {
	/** Printed above the section's table; empty string for no heading. */
	heading: string;
	entries: CareLogReportEntry[];
}

/**
 * One section per resident, alphabetical, each in time order -- inspectors
 * review care resident by resident. Keyed by ID so two residents who share a
 * name are never merged. `entries` arrive sorted oldest first.
 */
export function groupCareLogEntries(
	entries: CareLogReportEntry[]
): CareLogReportSection[] {
	const byResident = new Map<string, CareLogReportSection>();
	for (const entry of entries) {
		const section = byResident.get(entry.residentId) ?? {
			heading: entry.residentName,
			entries: [],
		};
		section.entries.push(entry);
		byResident.set(entry.residentId, section);
	}
	return Array.from(byResident.values()).sort((a, b) =>
		a.heading.localeCompare(b.heading)
	);
}

function formatLongDate(isoDate: string): string {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
		timeZone: 'UTC',
		year: 'numeric',
		month: 'long',
		day: 'numeric',
	});
}

function formatDateTime(iso: string, timeZone: string): string {
	return new Date(iso).toLocaleString('en-US', {
		timeZone,
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

function activitiesHtml(entry: CareLogReportEntry): string {
	// Same rule as the on-screen log table: an unchecked activity with no note
	// was never actually recorded, so it is left out.
	const recorded = entry.activities.filter(
		(activity) => activity.completed || (activity.notes && activity.notes.trim() !== '')
	);
	if (recorded.length === 0) return '';
	const items = recorded
		.map(
			(activity) =>
				`<li><span class="mark">${activity.completed ? '&#10003;' : '&#10007;'}</span>${escapePrintHtml(
					activity.activityType
				)}${activity.notes ? ` &mdash; ${escapePrintHtml(activity.notes)}` : ''}</li>`
		)
		.join('');
	return `<ul class="activities">${items}</ul>`;
}

function entryRowHtml(
	entry: CareLogReportEntry,
	timeZone: string,
	showResident: boolean
): string {
	const notes = formatLogContent(entry.content ?? '', entry.template ?? undefined, []);
	return `<tr>
		<td class="when">${escapePrintHtml(formatDateTime(entry.loggedAt, timeZone))}</td>
		${showResident ? `<td class="resident">${escapePrintHtml(entry.residentName)}</td>` : ''}
		<td class="staff">${escapePrintHtml(entry.authorName ?? '—')}</td>
		<td class="notes"><div>${escapePrintHtml(notes)}</div>${activitiesHtml(entry)}</td>
	</tr>`;
}

function residentSummaryHtml(entries: CareLogReportEntry[]): string {
	const counts = new Map<string, number>();
	for (const entry of entries) {
		counts.set(entry.residentName, (counts.get(entry.residentName) ?? 0) + 1);
	}
	const items = Array.from(counts.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([name, count]) => `<li>${escapePrintHtml(name)}: ${count}</li>`)
		.join('');
	return `<div class="summary"><strong>Entries by resident</strong><ul>${items}</ul></div>`;
}

export function buildCareLogReportHtml(report: CareLogReport): string {
	const total = report.entries.length;
	const period = `${formatLongDate(report.from)} – ${formatLongDate(report.to)}`;

	const body =
		total === 0
			? '<p class="empty">No activity logs were recorded at this location during this period.</p>'
			: `${residentSummaryHtml(report.entries)}${groupCareLogEntries(report.entries)
					.map((section) => {
						// A section headed by a resident's name makes the column redundant.
						const showResident = !section.heading;
						const count = section.entries.length;
						return `${
							section.heading
								? `<h2>${escapePrintHtml(section.heading)} <span class="count">(${count} ${
										count === 1 ? 'entry' : 'entries'
									})</span></h2>`
								: ''
						}<table>
		<thead><tr><th class="when">Date &amp; time</th>${
			showResident ? '<th class="resident">Resident</th>' : ''
		}<th class="staff">Staff</th><th>Notes &amp; activities</th></tr></thead>
		<tbody>${section.entries
			.map((entry) => entryRowHtml(entry, report.timeZone, showResident))
			.join('')}</tbody>
	</table>`;
					})
					.join('')}`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Activity Log Report – ${escapePrintHtml(report.location)} – ${escapePrintHtml(report.from)} to ${escapePrintHtml(report.to)}</title>
	<style>
		@page { size: Letter portrait; margin: 12mm; }
		* { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; color: #111; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
		.brand-header { display: flex; align-items: center; justify-content: center; gap: 2mm; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 9pt; }
		.brand-header img { width: 6mm; height: 6mm; object-fit: contain; }
		h1 { margin: 1.5mm 0 3mm; text-align: center; font-size: 13pt; letter-spacing: 0.3pt; }
		h2 { margin: 5mm 0 1.5mm; font-size: 10pt; break-after: avoid; page-break-after: avoid; }
		h2 .count { font-weight: 400; font-size: 8.5pt; color: #444; }
		.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm; margin-bottom: 3mm; font-size: 9pt; }
		.meta div span { font-weight: 700; }
		.summary { margin-bottom: 3mm; padding: 2mm; border: 0.25mm solid #999; font-size: 8pt; }
		.summary ul { margin: 1mm 0 0; padding: 0; list-style: none; columns: 3; }
		table { border-collapse: collapse; width: 100%; table-layout: fixed; }
		th, td { border: 0.25mm solid #444; padding: 1mm 1.2mm; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
		thead th { background: #eee; font-weight: 700; }
		tbody tr { break-inside: avoid; page-break-inside: avoid; }
		.when { width: 30mm; }
		.resident { width: 32mm; }
		.staff { width: 30mm; }
		.notes div { white-space: pre-wrap; }
		.activities { margin: 1mm 0 0; padding: 0; list-style: none; font-size: 7.5pt; color: #222; }
		.activities .mark { display: inline-block; width: 3.5mm; font-weight: 700; }
		.empty { margin: 8mm 0; text-align: center; font-size: 10pt; }
		.footer { margin-top: 4mm; font-size: 7.5pt; color: #444; }
	</style>
</head>
<body>
	<div class="brand-header"><img src="${LOGO_URL}" alt="" /><span>${escapePrintHtml(ORGANIZATION_NAME)}</span></div>
	<h1>RESIDENT ACTIVITY LOG REPORT</h1>
	<div class="meta">
		<div>Location: <span>${escapePrintHtml(report.location)}</span></div>
		<div>Period: <span>${escapePrintHtml(period)}</span></div>
		<div>Total entries: <span>${total}</span></div>
		<div>Generated: <span>${escapePrintHtml(formatDateTime(report.generatedAt, report.timeZone))}</span></div>
	</div>
	${body}
	<p class="footer">End of report &middot; ${total} ${total === 1 ? 'entry' : 'entries'} &middot; Times shown in ${escapePrintHtml(report.timeZone)}.</p>
</body>
</html>`;
}

export async function printCareLogReport(report: CareLogReport): Promise<boolean> {
	return printDocument(buildCareLogReportHtml(report));
}
