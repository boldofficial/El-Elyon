// src/components/shared/printStaffRoster.ts
//
// Builds a printable staff roster for one home from the Staff Directory and
// sends it to the browser's print dialog (which offers "Save as PDF"). This
// replaces uploading a scanned paper roster: the roster in the app is the
// source of truth, so the printout is always current.
//
// Laid out like the Resident Activity Log Report (printCareLogReport.ts) so
// the documents handed to inspectors look like one set.

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

const ORGANIZATION_NAME = 'EL ELYON PROPERTIES LLC';
// Hands-and-heart mark cut from the brand artwork. (/logo.svg is a "LOGO" placeholder.)
const EMBLEM_URL = '/el-elyon-emblem.svg';

// Calendar dates are stored as YYYY-MM-DD; show them without a timezone shift.
function formatDate(value: string | null) {
	if (!value) return '—';
	const [y, m, d] = value.split('-');
	return `${m}/${d}/${y}`;
}

function formatStatus(status: string | null) {
	return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Active';
}

function formatDateTime(value: Date) {
	return value.toLocaleString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

export function buildStaffRosterHtml({home, roster, generatedAt = new Date()}: PrintableRoster): string {
	const total = roster.length;
	const body =
		total === 0
			? '<p class="empty">Nobody is on this roster yet.</p>'
			: `<table>
		<thead><tr><th class="num">#</th><th>Name</th><th>Title</th><th class="hired">Date of hire</th><th class="status">Status</th></tr></thead>
		<tbody>${roster
			.map(
				(row, i) =>
					`<tr><td class="num">${i + 1}</td><td>${esc(row.name)}</td><td>${esc(
						row.title || '—'
					)}</td><td>${esc(formatDate(row.rosterHireDate))}</td><td>${esc(
						formatStatus(row.employmentStatus)
					)}</td></tr>`
			)
			.join('')}</tbody>
	</table>`;

	return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Staff Roster – ${esc(home.name)}</title>
	<style>
		@page { size: Letter portrait; margin: 12mm; }
		* { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; color: #111; background: #fff; font-family: Arial, Helvetica, sans-serif; font-size: 8.5pt; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
		.brand-header { display: flex; align-items: center; justify-content: center; gap: 2.5mm; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; font-size: 10pt; color: #26499b; }
		.brand-header img { height: 10mm; width: auto; }
		h1 { margin: 1.5mm 0 3mm; text-align: center; font-size: 13pt; letter-spacing: 0.3pt; }
		.meta { display: grid; grid-template-columns: 1fr 1fr; gap: 1mm 6mm; margin-bottom: 3mm; font-size: 9pt; }
		.meta div span { font-weight: 700; }
		table { border-collapse: collapse; width: 100%; table-layout: fixed; }
		th, td { border: 0.25mm solid #444; padding: 1mm 1.2mm; vertical-align: top; text-align: left; overflow-wrap: anywhere; }
		thead th { background: #eee; font-weight: 700; }
		tbody tr { break-inside: avoid; page-break-inside: avoid; }
		.num { width: 8mm; }
		.hired { width: 26mm; }
		.status { width: 22mm; }
		.empty { margin: 8mm 0; text-align: center; font-size: 10pt; }
		.footer { margin-top: 4mm; font-size: 7.5pt; color: #444; }
	</style>
</head>
<body>
	<div class="brand-header"><img src="${EMBLEM_URL}" alt="" /><span>${esc(ORGANIZATION_NAME)}</span></div>
	<h1>STAFF ROSTER</h1>
	<div class="meta">
		<div>Location: <span>${esc(home.name)}</span></div>
		<div>Address: <span>${esc(home.address || '—')}</span></div>
		<div>Total staff: <span>${total}</span></div>
		<div>Phone: <span>${esc(home.phone || '—')}</span></div>
		<div>Generated: <span>${esc(formatDateTime(generatedAt))}</span></div>
	</div>
	${body}
	<p class="footer">End of roster &middot; ${total} staff &middot; Generated from the Staff Directory.</p>
</body>
</html>`;
}

export function printStaffRoster(roster: PrintableRoster): Promise<boolean> {
	if (typeof window === 'undefined') return Promise.resolve(false);
	return printDocument(buildStaffRosterHtml(roster), {
		onError: (error) => console.error('Unable to print staff roster', error),
	}).catch(() => false);
}
