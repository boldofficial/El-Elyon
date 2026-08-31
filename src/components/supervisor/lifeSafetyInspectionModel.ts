import type {InspectionEquipmentType} from './printLifeSafetyReports';

export const INSPECTION_MONTHS = [
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

export const INSPECTION_EQUIPMENT = [
	{type: 'smoke' as const, label: 'Smoke detectors', dateLabel: 'Test date'},
	{type: 'carbon_monoxide' as const, label: 'CO detectors', dateLabel: 'Test date'},
	{type: 'fire_extinguisher' as const, label: 'Fire extinguishers', dateLabel: 'Inspection date'},
] as const;

export type InspectionOutcome = 'pass' | 'fail';

export interface LifeSafetyInspectionEntry {
	id: string;
	locationId: string;
	houseNameSnapshot: string;
	reportYear: number;
	reportMonth: number;
	equipmentType: InspectionEquipmentType;
	inspectionDate: string;
	staffInitials: string;
	outcome: InspectionOutcome;
	notes: string | null;
	version: number;
}

export interface AnnualInspectionRow {
	month: number;
	monthName: (typeof INSPECTION_MONTHS)[number];
	entries: Record<InspectionEquipmentType, LifeSafetyInspectionEntry | undefined>;
}

export function buildAnnualInspectionRows(
	entries: LifeSafetyInspectionEntry[]
): AnnualInspectionRow[] {
	const byIdentity = new Map<string, LifeSafetyInspectionEntry>();
	for (const entry of entries) {
		byIdentity.set(`${entry.reportMonth}:${entry.equipmentType}`, entry);
	}

	return INSPECTION_MONTHS.map((monthName, index) => {
		const month = index + 1;
		return {
			month,
			monthName,
			entries: {
				smoke: byIdentity.get(`${month}:smoke`),
				carbon_monoxide: byIdentity.get(`${month}:carbon_monoxide`),
				fire_extinguisher: byIdentity.get(`${month}:fire_extinguisher`),
			},
		};
	});
}

export function inspectionDateBounds(year: number, month: number) {
	const monthValue = String(month).padStart(2, '0');
	const finalDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
	return {
		minimum: `${year}-${monthValue}-01`,
		maximum: `${year}-${monthValue}-${String(finalDay).padStart(2, '0')}`,
	};
}

export function formatLocalInspectionDate(value: string | null | undefined): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
	return match ? `${match[2]}/${match[3]}/${match[1]}` : '—';
}

export function initialsFromName(name: string | null | undefined): string {
	if (!name) return '';
	return name
		.trim()
		.split(/\s+/)
		.filter(Boolean)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('')
		.slice(0, 50);
}
