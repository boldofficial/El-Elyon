// src/components/shared/printStaffRoster.ts
//
// Builds a printable staff roster for one home from the Staff Directory and
// sends it to the browser's print dialog (which offers "Save as PDF"). This
// replaces uploading a scanned paper roster: the roster in the app is the
// source of truth, so the printout is always current.

import {escapePrintHtml as esc, printDocument} from './printDocument';

export interface PrintableRoster {
	home: {name: string; address: string | null; phone: string | null};
	roster: {
		name: string;
		title: string | null;
		rosterHireDate: string | null;
		employmentStatus: string | null;
	}[];
	generatedAt?: Date;
}

const ORG_NAME = 'El-Elyon Care Management';

// Calendar dates are stored as YYYY-MM-DD; show them without a timezone shift.
function formatDate(value: string | null) {
	if (!value) return '—';
	const [y, m, d] = value.split('-');
	return `${m}/${d}/${y}`;
}

function formatStatus(status: string | null) {
	return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active';
}

export function buildStaffRosterHtml({home, roster, generatedAt = new Date()}: PrintableRoster): string {
	const contact = [home.address, home.phone].filter(Boolean).join(' · ');
	const rows =
		roster.length === 0
			? '<tr><td colspan="5" class="empty">Nobody is on this roster yet.</td></tr>'
			: roster
					.map(
						(row, i) => `<tr>
			<td class="num">${i + 1}</td>
			<td>${esc(row.name)}</td>
			<td>${esc(row.title || '—')}</td>
			<td class="nowrap">${esc(formatDate(row.rosterHireDate))}</td>
			<td>${esc(formatStatus(row.employmentStatus))}</td>
		</tr>`
					)
					.join('');

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Staff Roster — ${esc(home.name)}</title>
<style>
	* { box-sizing: border-box; }
	body {
		font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif;
		color: #1a1a1a;
		margin: 0;
		padding: 32px 36px;
		font-size: 13px;
		line-height: 1.5;
	}
	.doc-header { border-bottom: 2px solid #1d4ed8; padding-bottom: 12px; margin-bottom: 20px; }
	.org { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; }
	h1 { font-size: 22px; margin: 4px 0 0; }
	.contact { color: #4b5563; margin-top: 2px; }
	table { width: 100%; border-collapse: collapse; }
	thead { display: table-header-group; }
	th {
		text-align: left; font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
		color: #6b7280; border-bottom: 1px solid #d1d5db; padding: 6px 8px;
	}
	td { border-bottom: 1px solid #e5e7eb; padding: 6px 8px; vertical-align: top; }
	tr { page-break-inside: avoid; }
	.num { width: 2.5em; color: #6b7280; }
	.nowrap { white-space: nowrap; }
	.empty { text-align: center; color: #9ca3af; padding: 24px 8px; }
	.doc-footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
	@media print { body { padding: 0; } @page { margin: 18mm; } }
</style>
</head>
<body>
	<div class="doc-header">
		<div class="org">${esc(ORG_NAME)}</div>
		<h1>Staff Roster — ${esc(home.name)}</h1>
		${contact ? `<div class="contact">${esc(contact)}</div>` : ''}
	</div>

	<table>
		<thead>
			<tr><th>#</th><th>Name</th><th>Title</th><th>Date of hire</th><th>Status</th></tr>
		</thead>
		<tbody>${rows}</tbody>
	</table>

	<div class="doc-footer">
		<span>Total staff: ${roster.length}</span>
		<span>Generated from the Staff Directory: ${esc(generatedAt.toLocaleString())}</span>
	</div>
</body>
</html>`;
}

export function printStaffRoster(roster: PrintableRoster): Promise<boolean> {
	if (typeof window === 'undefined') return Promise.resolve(false);
	return printDocument(buildStaffRosterHtml(roster), {
		onError: (error) => console.error('Unable to print staff roster', error),
	}).catch(() => false);
}
