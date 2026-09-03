import {
	escapePrintHtml,
	printDocument,
	type PrintDocumentOptions
} from '../shared/printDocument';
import {MAX_FIRE_DRILL_DURATION_MINUTES} from '@/lib/life-safety-reporting';
import type {LifeSafetyEquipmentType} from '@/lib/life-safety-reporting';

const ORGANIZATION_NAME = 'EL ELYON PROPERTIES LLC';
const LOGO_URL = '/logo.svg';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MAX_TEXT = 2_000;
const MAX_STAFF = 24;
const MAX_PARTICIPANTS = 64;

export interface PrintableInspectionEntry {
	reportMonth: number;
	equipmentType: LifeSafetyEquipmentType;
	inspectionDate: string;
	staffInitials: string;
}

export interface PrintableAnnualInspectionReport {
	houseName: string;
	year: number;
	entries: PrintableInspectionEntry[];
}

export interface PrintableFireDrillParticipant {
	residentNameSnapshot: string;
	durationMinutes: number | null;
	durationSeconds: number | null;
	comment?: string | null;
	position?: number;
}

export interface PrintableFireDrillSection {
	sequence: 1 | 2;
	drillDate: string;
	drillTime: string;
	staffNames: string[];
	participants: PrintableFireDrillParticipant[];
}

export interface PrintableFireDrillReport {
	houseName: string;
	year: number;
	reports: PrintableFireDrillSection[];
}

export function buildAnnualInspectionPrintHtml(report: PrintableAnnualInspectionReport): string {
	validateAnnualInspectionReport(report);
	const entries = new Map(
		report.entries.map((entry) => [`${entry.reportMonth}:${entry.equipmentType}`, entry])
	);
	const cell = (month: number, type: LifeSafetyEquipmentType, field: 'date' | 'initials') => {
		const entry = entries.get(`${month}:${type}`);
		if (!entry) return '';
		return escapePrintHtml(field === 'date' ? formatLocalDate(entry.inspectionDate) : entry.staffInitials);
	};

	return documentShell({
		title: `Life Safety Inspections — ${report.houseName} — ${report.year}`,
		orientation: 'portrait',
		bodyClass: 'inspection-document',
		styles: inspectionStyles,
		body: `<main class="inspection-page">
			${brandHeader()}
			<h1>Smoke Detector, Carbon Monoxide (CO), and Fire Extinguisher Tests &amp; Inspections</h1>
			<div class="report-meta">
				<div><strong>House:</strong> <span>${escapePrintHtml(report.houseName)}</span></div>
				<div><strong>Year:</strong> <span>${escapePrintHtml(report.year)}</span></div>
			</div>
			<table class="inspection-table" aria-label="Annual life-safety inspections">
				<thead>
					<tr>
						<th rowspan="2" class="month-heading"><span class="visually-hidden">Month</span></th>
						<th colspan="2">All Smoke<br />Detectors</th>
						<th colspan="2">All CO Detectors</th>
						<th colspan="2">All Fire Extinguishers</th>
					</tr>
					<tr class="subhead">
						<th>Test Date</th><th>Completed by<br />(initials)</th>
						<th>Test Date</th><th>Completed by<br />(initials)</th>
						<th>Inspection Date</th><th>Completed by<br />(initials)</th>
					</tr>
				</thead>
				<tbody>${MONTHS.map((month, index) => {
					const number = index + 1;
					return `<tr><th scope="row">${month}</th><td>${cell(number, 'smoke', 'date')}</td><td>${cell(number, 'smoke', 'initials')}</td><td>${cell(number, 'carbon_monoxide', 'date')}</td><td>${cell(number, 'carbon_monoxide', 'initials')}</td><td>${cell(number, 'fire_extinguisher', 'date')}</td><td>${cell(number, 'fire_extinguisher', 'initials')}</td></tr>`;
				}).join('')}</tbody>
			</table>
		</main>`
	});
}

export function buildFireDrillPrintHtml(report: PrintableFireDrillReport): string {
	validateFireDrillReport(report);
	const sections = new Map(report.reports.map((section) => [section.sequence, section]));
	const first = sections.get(1);
	const second = sections.get(2);
	const firstChunks = chunk(first?.participants ?? [], 4);
	const secondChunks = chunk(second?.participants ?? [], 4);
	const overflowPageCount = Math.max(firstChunks.length - 1, secondChunks.length - 1, 0);

	const pages = [
		fireDrillPage(report, [
			fireDrillSection(1, first, firstChunks[0] ?? [], false),
			fireDrillSection(2, second, secondChunks[0] ?? [], false)
		])
	];

	for (let index = 0; index < overflowPageCount; index += 1) {
		const continuationSections: string[] = [];
		const firstChunk = firstChunks[index + 1];
		const secondChunk = secondChunks[index + 1];
		if (firstChunk) continuationSections.push(fireDrillSection(1, first, firstChunk, true));
		if (secondChunk) continuationSections.push(fireDrillSection(2, second, secondChunk, true));
		pages.push(fireDrillPage(report, continuationSections));
	}

	return documentShell({
		title: `Fire Drill Report — ${report.houseName} — ${report.year}`,
		orientation: 'landscape',
		bodyClass: 'fire-drill-document',
		styles: fireDrillStyles,
		body: pages.join('')
	});
}

export function printAnnualInspectionReport(
	report: PrintableAnnualInspectionReport,
	options?: PrintDocumentOptions
): Promise<boolean> {
	return printDocument(buildAnnualInspectionPrintHtml(report), options);
}

export function printFireDrillReport(
	report: PrintableFireDrillReport,
	options?: PrintDocumentOptions
): Promise<boolean> {
	return printDocument(buildFireDrillPrintHtml(report), options);
}

function fireDrillPage(report: PrintableFireDrillReport, sections: string[]): string {
	return `<main class="drill-page">
		${brandHeader()}
		<h1>FIRE DRILL REPORT</h1>
		<div class="drill-meta"><strong>House:</strong> ${escapePrintHtml(report.houseName)} <strong>Year:</strong> ${escapePrintHtml(report.year)}</div>
		${sections.join('')}
	</main>`;
}

function fireDrillSection(
	sequence: 1 | 2,
	report: PrintableFireDrillSection | undefined,
	participants: PrintableFireDrillParticipant[],
	continuation: boolean
): string {
	const label = sequence === 1 ? 'SEMI-ANNUAL FIRE DRILL' : 'ANNUAL FIRE DRILL';
	const padded = [...participants, ...Array.from({length: 4 - participants.length}, () => null)];
	const valueCells = (render: (participant: PrintableFireDrillParticipant) => string) =>
		padded.map((participant) => `<td>${participant ? render(participant) : ''}</td>`).join('');
	const dateTime = report
		? `${formatLocalDate(report.drillDate)} ${formatLocalTime(report.drillTime)}`
		: '';
	const staff = report?.staffNames.join(', ') ?? '';

	return `<section class="drill-section${continuation ? ' continuation' : ''}">
		<h2>${label}${continuation ? ' — CONTINUED' : ''}</h2>
		<table aria-label="${label}${continuation ? ' continuation' : ''}">
			<tbody>
				<tr class="event-row"><th>DATE/TIME:</th><td colspan="2">${escapePrintHtml(dateTime)}</td><th>STAFF PRESENT:</th><td>${escapePrintHtml(staff)}</td></tr>
				<tr class="resident-row"><th scope="row">RESIDENTS<br />PRESENT</th>${valueCells((participant) => escapePrintHtml(participant.residentNameSnapshot))}</tr>
				<tr class="time-row"><th scope="row">TIME TO REACH<br />GATHERING PLACE</th>${valueCells((participant) => formatDuration(participant))}</tr>
				<tr class="comments-row"><th scope="row">COMMENTS</th>${valueCells((participant) => escapePrintHtml(participant.comment))}</tr>
			</tbody>
		</table>
	</section>`;
}

function brandHeader(): string {
	return `<header class="brand-header"><img src="${LOGO_URL}" alt="" /><div>${ORGANIZATION_NAME}</div></header>`;
}

function documentShell(args: {
	title: string;
	orientation: 'portrait' | 'landscape';
	bodyClass: string;
	styles: string;
	body: string;
}): string {
	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title>${escapePrintHtml(args.title)}</title>
	<style>
		@page { size: Letter ${args.orientation}; margin: 0; }
		* { box-sizing: border-box; }
		html, body { margin: 0; padding: 0; color: #111; background: #fff; font-family: Arial, Helvetica, sans-serif; }
		.brand-header { display: flex; align-items: center; justify-content: center; gap: 2.5mm; font-family: Georgia, 'Times New Roman', serif; font-weight: 700; }
		.brand-header img { width: 10mm; height: 10mm; object-fit: contain; }
		table { border-collapse: collapse; width: 100%; table-layout: fixed; }
		th, td { overflow-wrap: anywhere; }
		.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
		${args.styles}
		@media print { html, body { print-color-adjust: exact; -webkit-print-color-adjust: exact; } }
	</style>
</head>
<body class="${args.bodyClass}">${args.body}</body>
</html>`;
}

function validateAnnualInspectionReport(report: PrintableAnnualInspectionReport): void {
	validateBase(report.houseName, report.year);
	if (!Array.isArray(report.entries) || report.entries.length > 36) {
		throw new TypeError('Inspection reports may contain at most 36 entries');
	}
	const identities = new Set<string>();
	for (const entry of report.entries) {
		if (!Number.isInteger(entry.reportMonth) || entry.reportMonth < 1 || entry.reportMonth > 12) {
			throw new TypeError('Inspection months must be between 1 and 12');
		}
		if (!['smoke', 'carbon_monoxide', 'fire_extinguisher'].includes(entry.equipmentType)) {
			throw new TypeError('Unsupported inspection equipment type');
		}
		validateText(entry.inspectionDate, 10, 'Inspection date');
		validateText(entry.staffInitials, 50, 'Staff initials');
		const identity = `${entry.reportMonth}:${entry.equipmentType}`;
		if (identities.has(identity)) throw new TypeError('Duplicate inspection report slot');
		identities.add(identity);
	}
}

function validateFireDrillReport(report: PrintableFireDrillReport): void {
	validateBase(report.houseName, report.year);
	if (!Array.isArray(report.reports) || report.reports.length > 2) {
		throw new TypeError('Fire drill sheets may contain at most two reports');
	}
	const sequences = new Set<number>();
	for (const section of report.reports) {
		if (section.sequence !== 1 && section.sequence !== 2) throw new TypeError('Invalid fire drill sequence');
		if (sequences.has(section.sequence)) throw new TypeError('Duplicate fire drill sequence');
		sequences.add(section.sequence);
		validateText(section.drillDate, 10, 'Fire drill date');
		validateText(section.drillTime, 8, 'Fire drill time');
		if (!Array.isArray(section.staffNames) || section.staffNames.length > MAX_STAFF) {
			throw new TypeError(`Fire drill reports may contain at most ${MAX_STAFF} staff members`);
		}
		section.staffNames.forEach((name) => validateText(name, 255, 'Staff name'));
		if (!Array.isArray(section.participants) || section.participants.length > MAX_PARTICIPANTS) {
			throw new TypeError(`Fire drill reports may contain at most ${MAX_PARTICIPANTS} participants`);
		}
		for (const participant of section.participants) {
			validateText(participant.residentNameSnapshot, 255, 'Resident name');
			if (participant.comment !== null && participant.comment !== undefined) {
				validateText(participant.comment, MAX_TEXT, 'Participant comment', true);
			}
			validateDuration(participant);
		}
	}
}

function validateBase(houseName: string, year: number): void {
	validateText(houseName, 255, 'House name');
	if (!Number.isInteger(year) || year < 2020 || year > 2100) {
		throw new TypeError('Report year must be between 2020 and 2100');
	}
}

function validateText(
	value: unknown,
	maximum: number,
	label: string,
	allowEmpty = false
): asserts value is string {
	if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0) || value.length > maximum) {
		throw new TypeError(`${label} must be ${allowEmpty ? 'a' : 'a non-empty'} string of at most ${maximum} characters`);
	}
}

function validateDuration(participant: PrintableFireDrillParticipant): void {
	const {durationMinutes, durationSeconds} = participant;
	if (durationMinutes === null && durationSeconds === null) return;
	if (
		!Number.isInteger(durationMinutes) ||
		(durationMinutes as number) < 0 ||
		(durationMinutes as number) > MAX_FIRE_DRILL_DURATION_MINUTES ||
		!Number.isInteger(durationSeconds) ||
		(durationSeconds as number) < 0 ||
		(durationSeconds as number) > 59
	) {
		throw new TypeError('Participant duration must contain non-negative minutes and 0-59 seconds');
	}
}

function formatLocalDate(value: string): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	return match ? `${match[2]}/${match[3]}/${match[1]}` : value;
}

function formatLocalTime(value: string): string {
	const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
	if (!match) return value;
	const hour = Number(match[1]);
	return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

function formatDuration(participant: PrintableFireDrillParticipant): string {
	if (participant.durationMinutes === null || participant.durationSeconds === null) {
		return '<span class="no-time">No recorded time</span>';
	}
	return `${escapePrintHtml(participant.durationMinutes)} Minutes&nbsp;&nbsp;${escapePrintHtml(participant.durationSeconds)} Seconds`;
}

function chunk<T>(values: T[], size: number): T[][] {
	const chunks: T[][] = [];
	for (let index = 0; index < values.length; index += size) chunks.push(values.slice(index, index + size));
	return chunks;
}

const inspectionStyles = `
	.inspection-page { width: 8.5in; height: 11in; padding: 12mm 10mm 10mm; break-after: page; page-break-after: always; }
	.inspection-page:last-child { break-after: auto; page-break-after: auto; }
	.inspection-page .brand-header { font-size: 16pt; margin-bottom: 1.5mm; }
	.inspection-page h1 { margin: 0 0 2mm; text-align: center; font-family: Georgia, 'Times New Roman', serif; font-size: 13pt; line-height: 1.2; }
	.report-meta { width: 62mm; margin: 0 auto 3mm; font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; }
	.report-meta div { display: flex; align-items: flex-end; gap: 2mm; margin-top: 1mm; }
	.report-meta span { flex: 1; min-height: 5mm; padding: 0 2mm 0.5mm; border-bottom: 0.35mm solid #333; }
	.inspection-table { height: 210mm; font-size: 9.5pt; }
	.inspection-table th, .inspection-table td { border: 0.35mm solid #333; padding: 1.2mm; text-align: center; vertical-align: middle; }
	.inspection-table thead tr:first-child { height: 12mm; font-size: 10.5pt; }
	.inspection-table .subhead { height: 14mm; font-size: 8.5pt; }
	.inspection-table tbody tr { height: 14.7mm; }
	.inspection-table tbody th { width: 12%; text-align: left; padding-left: 4mm; font-size: 10pt; }
	.inspection-table .month-heading { width: 12%; }
`;

const fireDrillStyles = `
	.drill-page { width: 11in; height: 8.5in; padding: 8mm 12mm 7mm; break-after: page; page-break-after: always; overflow: hidden; }
	.drill-page:last-child { break-after: auto; page-break-after: auto; }
	.drill-page .brand-header { font-family: Arial, Helvetica, sans-serif; font-size: 15pt; }
	.drill-page .brand-header img { width: 8mm; height: 8mm; }
	.drill-page h1 { margin: -0.5mm 0 0; text-align: center; font-size: 12pt; }
	.drill-meta { text-align: center; font-size: 8.5pt; margin: 0.5mm 0 1mm; }
	.drill-meta strong + * { margin-left: 2mm; }
	.drill-section { margin-top: 1.8mm; break-inside: avoid; page-break-inside: avoid; }
	.drill-section h2 { margin: 0 0 1mm; text-align: center; font-size: 11pt; }
	.drill-section table { height: 78mm; font-size: 8.3pt; }
	.drill-section th, .drill-section td { border: 0.35mm solid #111; padding: 1.2mm; text-align: center; vertical-align: middle; }
	.drill-section th { width: 16%; font-weight: 700; }
	.drill-section td { width: 21%; white-space: pre-wrap; }
	.drill-section .event-row { height: 10mm; }
	.drill-section .event-row th { width: 13%; }
	.drill-section .resident-row { height: 14mm; }
	.drill-section .time-row { height: 16mm; }
	.drill-section .comments-row { height: 35mm; }
	.drill-section .comments-row td { text-align: left; vertical-align: top; }
	.drill-section .no-time { font-style: italic; color: #444; }
	.drill-section.continuation table { height: 150mm; }
	.drill-section.continuation .comments-row { height: 90mm; }
	.drill-page:has(.drill-section.continuation + .drill-section.continuation) .drill-section.continuation table { height: 70mm; }
	.drill-page:has(.drill-section.continuation + .drill-section.continuation) .drill-section.continuation .comments-row { height: 28mm; }
`;
