export const FIRE_DRILL_SLOTS = [
	{sequence: 1 as const, label: 'Semi-Annual Fire Drill'},
	{sequence: 2 as const, label: 'Annual Fire Drill'},
] as const;

export type ParticipantSource = 'roster' | 'manual' | 'external';

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
	sequence: 1 | 2;
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
	return reports.find((report) => report.sequence === sequence && !report.voidedAt);
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
			if (seenUnlinkedNames.has(comparableName)) errors.push(`Resident ${position + 1}: this saved resident was already added.`);
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
			if (!Number.isInteger(durationMinutes) || durationMinutes < 0) {
				errors.push(`Resident ${position + 1}: minutes must be a whole number of zero or more.`);
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

export async function collectLegacyPages<T>(
	fetchPage: (cursor: string | null) => Promise<{data: T[]; nextCursor: string | null}>,
	maximumPages = 100
): Promise<T[]> {
	const rows: T[] = [];
	let cursor: string | null = null;
	for (let page = 0; page < maximumPages; page += 1) {
		const result = await fetchPage(cursor);
		rows.push(...result.data);
		if (!result.nextCursor) return rows;
		if (result.nextCursor === cursor) throw new Error('Legacy pagination returned the same cursor twice');
		cursor = result.nextCursor;
	}
	throw new Error('Legacy history exceeded the supported pagination limit');
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
