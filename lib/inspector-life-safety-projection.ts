export type InspectorEquipmentType = 'smoke' | 'carbon_monoxide' | 'fire_extinguisher';
export type InspectorInspectionOutcome = 'pass' | 'fail';

export interface InspectorLifeSafetyInspection {
	reportYear: number;
	reportMonth: number;
	equipmentType: InspectorEquipmentType;
	inspectionDate: string;
	staffInitials: string;
	outcome: InspectorInspectionOutcome;
	notes: string | null;
}

export interface InspectorFireDrillParticipant {
	residentNameSnapshot: string;
	durationMinutes: number | null;
	durationSeconds: number | null;
	comment: string | null;
	position: number;
}

export interface InspectorFireDrillReport {
	reportYear: number;
	sequence: 1 | 2;
	drillDate: string;
	drillTime: string;
	staffNames: string[];
	participants: InspectorFireDrillParticipant[];
}

export interface InspectorLegacySmokeCheck {
	date: string;
	smokeStatus: string;
	coStatus: string;
	staffInitials: string;
	notes: string | null;
}

export interface InspectorLegacyFireDrill {
	year: number;
	sequence: number;
	residentName: string;
	date: string;
	time: string;
	staffName: string;
	comment: string | null;
}

export interface InspectorLifeSafetyData {
	houseName: string;
	inspections: InspectorLifeSafetyInspection[];
	fireDrills: InspectorFireDrillReport[];
	legacySmokeChecks: InspectorLegacySmokeCheck[];
	legacyFireDrills: InspectorLegacyFireDrill[];
}

export class InspectorLifeSafetyScopeError extends Error {
	constructor() {
		super('Inspector life-safety location is unavailable');
		this.name = 'InspectorLifeSafetyScopeError';
	}
}

export function requireExactlyOneActiveInspectorLocation<T extends {id: string; name: string}>(
	rows: readonly T[],
	sessionLocation: string
): T {
	if (rows.length !== 1 || rows[0]?.name !== sessionLocation) {
		throw new InspectorLifeSafetyScopeError();
	}
	return rows[0];
}

type RawInspection = Omit<InspectorLifeSafetyInspection, 'equipmentType' | 'outcome'> & {
	equipmentType: string;
	outcome: string;
} & Record<string, unknown>;
type RawFireDrill = Omit<InspectorFireDrillReport, 'participants' | 'sequence'> & {
	id: string;
	sequence: number;
} & Record<string, unknown>;
type RawParticipant = InspectorFireDrillParticipant & {fireDrillReportId: string} & Record<string, unknown>;
type RawLegacySmoke = Omit<InspectorLegacySmokeCheck, 'date'> & {date: string | Date} & Record<string, unknown>;
type RawLegacyFireDrill = Omit<InspectorLegacyFireDrill, 'date'> & {date: string | Date} & Record<string, unknown>;

export function projectInspectorLifeSafetyData(args: {
	location: {id: string; name: string};
	inspections: RawInspection[];
	fireDrills: RawFireDrill[];
	participants: RawParticipant[];
	legacySmokeChecks: RawLegacySmoke[];
	legacyFireDrills: RawLegacyFireDrill[];
}): InspectorLifeSafetyData {
	return {
		houseName: args.location.name,
		inspections: args.inspections.map((entry) => ({
			reportYear: entry.reportYear,
			reportMonth: entry.reportMonth,
			equipmentType: requireEquipmentType(entry.equipmentType),
			inspectionDate: entry.inspectionDate,
			staffInitials: entry.staffInitials,
			outcome: requireInspectionOutcome(entry.outcome),
			notes: entry.notes,
		})),
		fireDrills: args.fireDrills.map((report) => ({
			reportYear: report.reportYear,
			sequence: requireFireDrillSequence(report.sequence),
			drillDate: report.drillDate,
			drillTime: report.drillTime,
			staffNames: [...report.staffNames],
			participants: args.participants
				.filter((participant) => participant.fireDrillReportId === report.id)
				.sort((left, right) => left.position - right.position)
				.map((participant) => ({
					residentNameSnapshot: participant.residentNameSnapshot,
					durationMinutes: participant.durationMinutes,
					durationSeconds: participant.durationSeconds,
					comment: participant.comment,
					position: participant.position,
				})),
		})),
		legacySmokeChecks: args.legacySmokeChecks.map((entry) => ({
			date: serializeDate(entry.date),
			smokeStatus: entry.smokeStatus,
			coStatus: entry.coStatus,
			staffInitials: entry.staffInitials,
			notes: entry.notes,
		})),
		legacyFireDrills: args.legacyFireDrills.map((entry) => ({
			year: entry.year,
			sequence: entry.sequence,
			residentName: entry.residentName,
			date: serializeDate(entry.date),
			time: entry.time,
			staffName: entry.staffName,
			comment: entry.comment,
		})),
	};
}

function serializeDate(value: string | Date): string {
	return value instanceof Date ? value.toISOString() : value;
}

function requireEquipmentType(value: string): InspectorEquipmentType {
	if (value === 'smoke' || value === 'carbon_monoxide' || value === 'fire_extinguisher') return value;
	throw new TypeError('Invalid life-safety equipment type');
}

function requireInspectionOutcome(value: string): InspectorInspectionOutcome {
	if (value === 'pass' || value === 'fail') return value;
	throw new TypeError('Invalid life-safety inspection outcome');
}

function requireFireDrillSequence(value: number): 1 | 2 {
	if (value === 1 || value === 2) return value;
	throw new TypeError('Invalid fire drill sequence');
}
