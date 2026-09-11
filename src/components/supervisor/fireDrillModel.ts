import {
	MAX_FIRE_DRILL_DURATION_MINUTES,
	admissionDrillAnchorDate,
	evaluateAdmissionDrill,
	type AdmissionDrillEvaluation,
	type AdmissionDrillState,
	type FireDrillType,
} from '@/lib/life-safety-reporting';

export const FIRE_DRILL_SLOTS = [
	{sequence: 1 as const, label: 'Semi-Annual Fire Drill'},
	{sequence: 2 as const, label: 'Annual Fire Drill'},
] as const;

// The single "type of drill" dropdown. The two scheduled kinds map onto the
// once-per-year sequence slots; admission drills are per resident.
export type DrillTypeKey = 'semi_annual' | 'annual' | 'admission';

export const DRILL_TYPE_OPTIONS: ReadonlyArray<
	| {key: 'semi_annual' | 'annual'; label: string; drillType: 'scheduled'; sequence: 1 | 2}
	| {key: 'admission'; label: string; drillType: 'admission'; sequence: null}
> = [
	{key: 'semi_annual', label: 'Semi-Annual Fire Drill', drillType: 'scheduled', sequence: 1},
	{key: 'annual', label: 'Annual Fire Drill', drillType: 'scheduled', sequence: 2},
	{key: 'admission', label: 'Admission/Placement Drill', drillType: 'admission', sequence: null},
];

export function drillTypeOption(key: DrillTypeKey) {
	return DRILL_TYPE_OPTIONS.find((option) => option.key === key)!;
}

export function drillTypeKeyForReport(report: Pick<FireDrillReportRecord, 'drillType' | 'sequence'>): DrillTypeKey {
	if (report.drillType === 'admission') return 'admission';
	return report.sequence === 2 ? 'annual' : 'semi_annual';
}

export type ParticipantSource = 'roster' | 'manual';

export interface FireDrillParticipantRecord {
	id?: string;
	residentId: string | null;
	residentNameSnapshot: string;
	participantSource: ParticipantSource;
	durationMinutes: number | null;
	durationSeconds: number | null;
	comment: string | null;
	position: number;
}

export interface FireDrillReportRecord {
	id: string;
	locationId: string;
	houseNameSnapshot: string;
	reportYear: number;
	drillType: FireDrillType;
	sequence: 1 | 2 | null;
	admissionResidentId: string | null;
	admissionResidentNameSnapshot: string | null;
	drillDate: string;
	drillTime: string;
	staffNames: string[];
	version: number;
	voidedAt?: string | null;
	participants: FireDrillParticipantRecord[];
}

export interface ParticipantDraft {
	key: string;
	residentId: string | null;
	residentNameSnapshot: string;
	participantSource: ParticipantSource;
	durationMinutes: string;
	durationSeconds: string;
	comment: string;
}

export interface ParticipantValidationResult {
	participants: FireDrillParticipantRecord[];
	errors: string[];
}

export interface StaffValidationResult {
	staffNames: string[];
	errors: string[];
}

export function reportForSequence(
	reports: FireDrillReportRecord[],
	sequence: 1 | 2
): FireDrillReportRecord | undefined {
	return reports.find(
		(report) => report.drillType === 'scheduled' && report.sequence === sequence && !report.voidedAt
	);
}

export function admissionReports(reports: FireDrillReportRecord[]): FireDrillReportRecord[] {
	return reports
		.filter((report) => report.drillType === 'admission' && !report.voidedAt)
		.sort((left, right) => left.drillDate.localeCompare(right.drillDate));
}

// Shape returned by GET /api/documents/admission-drill-status.
export interface AdmissionDrillFact {
	residentId: string;
	residentName: string;
	placementDate: string | null;
	createdAt: string | null;
	latestAdmissionDrill: {id: string; drillDate: string; reportYear: number} | null;
}

export interface AdmissionDrillRow extends AdmissionDrillEvaluation {
	residentId: string;
	residentName: string;
	drill: AdmissionDrillFact['latestAdmissionDrill'];
}

export const ADMISSION_STATE_LABELS: Record<AdmissionDrillState, string> = {
	not_started: 'Placement upcoming',
	due: 'Drill due',
	overdue: 'Overdue',
	completed: 'Completed',
	completed_late: 'Completed late',
};

// Countdown rows for the workspace panel. Residents without any placement
// anchor are skipped rather than shown with a bogus deadline. Open items sort
// first (most overdue at the top), then completed ones by resident name.
export function buildAdmissionDrillRows(facts: AdmissionDrillFact[], today: string): AdmissionDrillRow[] {
	const rows: AdmissionDrillRow[] = [];
	for (const fact of facts) {
		const anchorDate = admissionDrillAnchorDate(fact);
		if (!anchorDate) continue;
		rows.push({
			residentId: fact.residentId,
			residentName: fact.residentName,
			drill: fact.latestAdmissionDrill,
			...evaluateAdmissionDrill({
				anchorDate,
				drillDate: fact.latestAdmissionDrill?.drillDate ?? null,
				today,
			}),
		});
	}
	const rank: Record<AdmissionDrillState, number> = {
		overdue: 0,
		due: 1,
		not_started: 2,
		completed_late: 3,
		completed: 4,
	};
	return rows.sort(
		(left, right) =>
			rank[left.state] - rank[right.state] ||
			left.daysRemaining - right.daysRemaining ||
			left.residentName.localeCompare(right.residentName)
	);
}

export function isOpenAdmissionState(state: AdmissionDrillState): boolean {
	return state === 'due' || state === 'overdue';
}

export function participantDraftsFromReport(report?: FireDrillReportRecord): ParticipantDraft[] {
	if (!report) return [];
	return [...report.participants]
		.sort((left, right) => left.position - right.position)
		.map((participant, index) => ({
			key: participant.id ?? `saved-${index}`,
			residentId: participant.residentId,
			residentNameSnapshot: participant.residentNameSnapshot,
			participantSource: participant.participantSource,
			durationMinutes: participant.durationMinutes === null ? '' : String(participant.durationMinutes),
			durationSeconds: participant.durationSeconds === null ? '' : String(participant.durationSeconds),
			comment: participant.comment ?? '',
		}));
}

export function validateParticipantDrafts(drafts: ParticipantDraft[]): ParticipantValidationResult {
	const errors: string[] = [];
	const seenRosterIds = new Set<string>();
	const seenUnlinkedNames = new Set<string>();
	const participants = drafts.map((draft, position) => {
		const name = draft.residentNameSnapshot.trim();
		const comment = draft.comment.trim();
		const minutesBlank = draft.durationMinutes.trim() === '';
		const secondsBlank = draft.durationSeconds.trim() === '';

		if (!name) errors.push(`Resident ${position + 1}: a name is required.`);
		if (name.length > 255) errors.push(`Resident ${position + 1}: the name is too long.`);
		if (comment.length > 2000) errors.push(`Resident ${position + 1}: the comment is too long.`);
		if (draft.participantSource === 'roster' && !draft.residentId) {
			errors.push(`Resident ${position + 1}: choose a resident from the house roster.`);
		}
		if (draft.participantSource !== 'roster' && draft.residentId) {
			errors.push(`Resident ${position + 1}: manual and external names cannot use a roster ID.`);
		}
		if (draft.residentId) {
			if (seenRosterIds.has(draft.residentId)) errors.push(`Resident ${position + 1}: this resident was already added.`);
			seenRosterIds.add(draft.residentId);
		} else if (name) {
			const comparableName = name.toLocaleLowerCase('en-US');
			if (seenUnlinkedNames.has(comparableName)) errors.push(`Resident ${position + 1}: this participant was already added.`);
			seenUnlinkedNames.add(comparableName);
		}

		let durationMinutes: number | null = null;
		let durationSeconds: number | null = null;
		if (minutesBlank !== secondsBlank) {
			errors.push(`Resident ${position + 1}: enter both minutes and seconds, or leave both blank.`);
		} else if (minutesBlank) {
			if (!comment) errors.push(`Resident ${position + 1}: explain why no gathering time was recorded.`);
		} else {
			durationMinutes = Number(draft.durationMinutes);
			durationSeconds = Number(draft.durationSeconds);
			if (
				!Number.isInteger(durationMinutes) ||
				durationMinutes < 0 ||
				durationMinutes > MAX_FIRE_DRILL_DURATION_MINUTES
			) {
				errors.push(
					`Resident ${position + 1}: minutes must be a whole number between 0 and ${MAX_FIRE_DRILL_DURATION_MINUTES}.`
				);
			}
			if (!Number.isInteger(durationSeconds) || durationSeconds < 0 || durationSeconds > 59) {
				errors.push(`Resident ${position + 1}: seconds must be a whole number from 0 through 59.`);
			}
		}

		return {
			residentId: draft.participantSource === 'roster' ? draft.residentId : null,
			residentNameSnapshot: name,
			participantSource: draft.participantSource,
			durationMinutes,
			durationSeconds,
			comment: comment || null,
			position,
		};
	});

	if (drafts.length === 0) errors.push('Add at least one resident result.');
	if (drafts.length > 64) errors.push('A fire drill may contain at most 64 resident results.');
	return {participants, errors};
}

export function validateStaffNames(values: string[]): StaffValidationResult {
	const errors: string[] = [];
	const seen = new Set<string>();
	const staffNames = values.map((value, index) => {
		const name = value.trim();
		if (!name) errors.push(`Staff member ${index + 1}: a name is required.`);
		if (name.length > 255) errors.push(`Staff member ${index + 1}: the name is too long.`);
		const comparable = name.toLocaleLowerCase('en-US');
		if (name && seen.has(comparable)) errors.push(`Staff member ${index + 1}: this person was already added.`);
		seen.add(comparable);
		return name;
	});
	if (values.length === 0) errors.push('Add at least one staff member who was present.');
	if (values.length > 24) errors.push('A fire drill may contain at most 24 staff members.');
	return {staffNames, errors};
}

export function preserveUnavailableRosterSnapshots(
	drafts: ParticipantDraft[],
	availableResidentIds: ReadonlySet<string>
): ParticipantDraft[] {
	return drafts.map((draft) =>
		draft.participantSource === 'roster' &&
		draft.residentId !== null &&
		!availableResidentIds.has(draft.residentId)
			? {...draft, residentId: null, participantSource: 'manual'}
			: draft
	);
}

export function moveParticipant<T>(items: T[], from: number, to: number): T[] {
	if (from < 0 || from >= items.length || to < 0 || to >= items.length || from === to) return items;
	const result = [...items];
	const [item] = result.splice(from, 1);
	result.splice(to, 0, item);
	return result;
}

export function formatLocalFireDrillDate(value: string | null | undefined): string {
	const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? '');
	return match ? `${match[2]}/${match[3]}/${match[1]}` : '—';
}

export function formatLocalFireDrillTime(value: string | null | undefined): string {
	const match = /^(\d{2}):(\d{2})/.exec(value ?? '');
	if (!match) return '—';
	const hour = Number(match[1]);
	return `${hour % 12 || 12}:${match[2]} ${hour >= 12 ? 'PM' : 'AM'}`;
}

export function formatGatheringDuration(minutes: number | null, seconds: number | null): string {
	return minutes === null || seconds === null
		? 'No recorded time'
		: `${minutes} min ${seconds} sec`;
}
