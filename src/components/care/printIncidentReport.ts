// src/components/care/printIncidentReport.ts
//
// Builds a clean, standalone printable document for a single incident report
// and sends it to the browser's print dialog (which offers "Save as PDF").
//
// Uses a hidden iframe rather than window.open() so popup blockers can't
// suppress it. The iframe is removed after printing.

export interface PrintableIncident {
	id: string;
	incidentDate: Date | string;
	incidentType: string;
	severity: string;
	description: string;
	reportedByName?: string | null;
	resident?: {name: string} | null;
	location?: string | null;
	actionTaken?: string | null;
	witnessNames?: string | null;
	followUpRequired?: boolean;
	followUpNotes?: string | null;
	attachments?: string[] | null;
	createdAt?: Date | string | null;
}

const ORG_NAME = 'El-Elyon Care Management';

// Escape user-supplied text so it can't break out of the HTML template.
function esc(value: unknown): string {
	if (value === null || value === undefined) return '';
	return String(value)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

function formatDate(value: Date | string | null | undefined): string {
	if (!value) return '—';
	const d = new Date(value);
	return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

// Strip the upload prefix (e.g. "1712-abc-") from a stored file key for display.
function attachmentLabel(fileKey: string, index: number): string {
	const filename = fileKey.split('/').pop() || `attachment-${index + 1}`;
	return filename.replace(/^\d+-[a-z0-9]+-/, '');
}

function buildPrintHtml(report: PrintableIncident): string {
	const residentName = report.resident?.name || 'Unknown Resident';
	const severity = (report.severity || '').toUpperCase();

	const attachmentsHtml =
		report.attachments && report.attachments.length > 0
			? `<ul class="attachments">${report.attachments
					.map((key, i) => `<li>${esc(attachmentLabel(key, i))}</li>`)
					.join('')}</ul>`
			: '<span class="muted">None</span>';

	const followUpHtml = report.followUpRequired
		? `<div class="followup">
				<strong>⚠ Follow-up required</strong>
				${report.followUpNotes ? `<p>${esc(report.followUpNotes)}</p>` : ''}
			</div>`
		: '<span class="muted">Not required</span>';

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Incident Report — ${esc(residentName)}</title>
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
	.doc-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		border-bottom: 2px solid #b91c1c;
		padding-bottom: 12px;
		margin-bottom: 20px;
	}
	.org { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: #6b7280; }
	h1 { font-size: 22px; margin: 4px 0 0; }
	.severity {
		display: inline-block;
		padding: 4px 12px;
		border-radius: 999px;
		font-weight: 700;
		font-size: 12px;
		border: 1px solid currentColor;
	}
	.sev-low { color: #166534; }
	.sev-medium { color: #92600e; }
	.sev-high { color: #9a3412; }
	.sev-critical { color: #b91c1c; }
	.meta-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 8px 24px;
		margin-bottom: 20px;
	}
	.meta-grid .row { display: flex; justify-content: space-between; border-bottom: 1px dotted #d1d5db; padding: 4px 0; }
	.meta-grid dt { color: #6b7280; }
	.meta-grid dd { margin: 0; font-weight: 600; text-align: right; }
	section { margin-bottom: 18px; page-break-inside: avoid; }
	section h2 {
		font-size: 11px; letter-spacing: .06em; text-transform: uppercase;
		color: #6b7280; margin: 0 0 6px; border-bottom: 1px solid #e5e7eb; padding-bottom: 3px;
	}
	.body-text { white-space: pre-wrap; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; padding: 10px 12px; }
	.muted { color: #9ca3af; }
	.attachments { margin: 0; padding-left: 18px; }
	.followup { background: #fffbeb; border: 1px solid #fde68a; border-radius: 6px; padding: 10px 12px; }
	.followup p { margin: 6px 0 0; }
	.doc-footer { margin-top: 28px; padding-top: 10px; border-top: 1px solid #e5e7eb; font-size: 11px; color: #9ca3af; display: flex; justify-content: space-between; }
	@media print { body { padding: 0; } @page { margin: 18mm; } }
</style>
</head>
<body>
	<div class="doc-header">
		<div>
			<div class="org">${esc(ORG_NAME)}</div>
			<h1>Incident Report</h1>
		</div>
		<span class="severity sev-${esc((report.severity || '').toLowerCase())}">${esc(severity)}</span>
	</div>

	<dl class="meta-grid">
		<div class="row"><dt>Resident</dt><dd>${esc(residentName)}</dd></div>
		<div class="row"><dt>Incident Type</dt><dd>${esc(report.incidentType)}</dd></div>
		<div class="row"><dt>Incident Date &amp; Time</dt><dd>${esc(formatDate(report.incidentDate))}</dd></div>
		<div class="row"><dt>Location</dt><dd>${esc(report.location || '—')}</dd></div>
		<div class="row"><dt>Reported By</dt><dd>${esc(report.reportedByName || '—')}</dd></div>
		<div class="row"><dt>Witnesses</dt><dd>${esc(report.witnessNames || '—')}</dd></div>
	</dl>

	<section>
		<h2>Description</h2>
		<div class="body-text">${esc(report.description) || '<span class="muted">No description provided</span>'}</div>
	</section>

	<section>
		<h2>Action Taken</h2>
		${
			report.actionTaken
				? `<div class="body-text">${esc(report.actionTaken)}</div>`
				: '<span class="muted">None recorded</span>'
		}
	</section>

	<section>
		<h2>Follow-up</h2>
		${followUpHtml}
	</section>

	<section>
		<h2>Attachments</h2>
		${attachmentsHtml}
	</section>

	<div class="doc-footer">
		<span>Report ID: ${esc(report.id)}</span>
		<span>Created: ${esc(formatDate(report.createdAt))} · Printed: ${esc(new Date().toLocaleString())}</span>
	</div>
</body>
</html>`;
}

export function printIncidentReport(report: PrintableIncident): void {
	if (typeof window === 'undefined') return;

	const iframe = document.createElement('iframe');
	iframe.style.position = 'fixed';
	iframe.style.right = '0';
	iframe.style.bottom = '0';
	iframe.style.width = '0';
	iframe.style.height = '0';
	iframe.style.border = '0';
	document.body.appendChild(iframe);

	const cleanup = () => {
		// Delay removal so the print dialog has fully grabbed the document.
		setTimeout(() => {
			if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
		}, 500);
	};

	const doc = iframe.contentWindow?.document;
	if (!doc) {
		cleanup();
		return;
	}

	doc.open();
	doc.write(buildPrintHtml(report));
	doc.close();

	const triggerPrint = () => {
		try {
			iframe.contentWindow?.focus();
			iframe.contentWindow?.print();
		} finally {
			cleanup();
		}
	};

	// Wait for the iframe document to finish loading before printing.
	if (iframe.contentWindow?.document.readyState === 'complete') {
		triggerPrint();
	} else {
		iframe.onload = triggerPrint;
	}
}
