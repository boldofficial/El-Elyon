import type {
	InspectorEquipmentType,
	InspectorFireDrillReport,
	InspectorLifeSafetyData,
	InspectorLifeSafetyInspection,
} from '@/lib/inspector-life-safety-projection';
import {formatLocalInspectionDate} from '../supervisor/lifeSafetyInspectionModel';
import {
	formatGatheringDuration,
	formatLocalFireDrillTime,
} from '../supervisor/fireDrillModel';

export const INSPECTOR_EQUIPMENT: ReadonlyArray<{type: InspectorEquipmentType; label: string}> = [
	{type: 'smoke', label: 'Smoke detectors'},
	{type: 'carbon_monoxide', label: 'CO detectors'},
	{type: 'fire_extinguisher', label: 'Fire extinguishers'},
];

const MONTHS = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December',
];

export interface InspectorAnnualInspectionRow {
	month: number;
	monthName: string;
	entries: Partial<Record<InspectorEquipmentType, InspectorLifeSafetyInspection>>;
}

export function buildInspectorAnnualInspectionRows(
	entries: InspectorLifeSafetyInspection[],
	year: number
): InspectorAnnualInspectionRow[] {
	const selected = entries.filter((entry) => entry.reportYear === year);
	return MONTHS.map((monthName, index) => {
		const month = index + 1;
		const rowEntries: Partial<Record<InspectorEquipmentType, InspectorLifeSafetyInspection>> = {};
		for (const entry of selected) {
			if (entry.reportMonth === month) rowEntries[entry.equipmentType] = entry;
		}
		return {month, monthName, entries: rowEntries};
	});
}

export function inspectorYears(data: InspectorLifeSafetyData, currentYear: number): number[] {
	const years = new Set<number>([currentYear]);
	for (const entry of data.inspections) years.add(entry.reportYear);
	for (const report of data.fireDrills) years.add(report.reportYear);
	for (const row of data.legacyFireDrills) years.add(row.year);
	for (const row of data.legacySmokeChecks) {
		const year = localYear(row.date);
		if (year !== null) years.add(year);
	}
	return [...years].sort((left, right) => right - left);
}

export function filterInspectorLifeSafetyYear(data: InspectorLifeSafetyData, year: number) {
	return {
		inspections: data.inspections.filter((entry) => entry.reportYear === year),
		fireDrills: data.fireDrills.filter((report) => report.reportYear === year),
		legacySmokeChecks: data.legacySmokeChecks.filter((entry) => localYear(entry.date) === year),
		legacyFireDrills: data.legacyFireDrills.filter((entry) => entry.year === year),
	};
}

export function inspectorFireDrillForSequence(
	reports: InspectorFireDrillReport[],
	sequence: 1 | 2
) {
	return reports.find((report) => report.sequence === sequence);
}

export const formatInspectorLocalDate = formatLocalInspectionDate;
export const formatInspectorLocalTime = formatLocalFireDrillTime;
export const formatInspectorDuration = formatGatheringDuration;

function localYear(value: string): number | null {
	const match = /^(\d{4})-/.exec(value);
	return match ? Number(match[1]) : null;
}
