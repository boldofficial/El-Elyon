import assert from 'node:assert/strict';
import test from 'node:test';
import {
	DRILL_TYPE_OPTIONS,
	FIRE_DRILL_SLOTS,
	admissionReports,
	buildAdmissionDrillRows,
	drillTypeKeyForReport,
	moveParticipant,
	preserveUnavailableRosterSnapshots,
	reportForSequence,
	validateParticipantDrafts,
	validateStaffNames,
	type FireDrillReportRecord,
	type ParticipantDraft,
} from './fireDrillModel';
import {collectLegacyPages} from './lifeSafetyWorkspace';

test('the reporting workspace exposes exactly the semi-annual and annual sequence slots', () => {
	assert.deepEqual(FIRE_DRILL_SLOTS.map((slot) => [slot.sequence, slot.label]), [
		[1, 'Semi-Annual Fire Drill'],
		[2, 'Annual Fire Drill'],
	]);
	const annual = report({sequence: 2});
	assert.equal(reportForSequence([annual], 1), undefined);
	assert.equal(reportForSequence([annual], 2), annual);
});

test('the drill-type dropdown maps onto the scheduled slots plus admission', () => {
	assert.deepEqual(DRILL_TYPE_OPTIONS.map((option) => [option.key, option.drillType, option.sequence]), [
		['semi_annual', 'scheduled', 1],
		['annual', 'scheduled', 2],
		['admission', 'admission', null],
	]);
	assert.equal(drillTypeKeyForReport(report({sequence: 1})), 'semi_annual');
	assert.equal(drillTypeKeyForReport(report({sequence: 2})), 'annual');
	assert.equal(drillTypeKeyForReport(report({drillType: 'admission', sequence: null})), 'admission');
});

test('admission drills never occupy a scheduled slot and list in date order', () => {
	const admissionB = report({id: 'b', drillType: 'admission', sequence: null, admissionResidentId: 'r2', admissionResidentNameSnapshot: 'Bravo', drillDate: '2026-05-01'});
	const admissionA = report({id: 'a', drillType: 'admission', sequence: null, admissionResidentId: 'r1', admissionResidentNameSnapshot: 'Alpha', drillDate: '2026-02-01'});
	const voided = report({id: 'v', drillType: 'admission', sequence: null, admissionResidentId: 'r3', admissionResidentNameSnapshot: 'Voided', voidedAt: '2026-03-01T00:00:00Z'});
	const semi = report({sequence: 1});
	assert.equal(reportForSequence([admissionA, semi], 1), semi);
	assert.equal(reportForSequence([admissionA], 1), undefined);
	assert.deepEqual(admissionReports([admissionB, voided, semi, admissionA]).map((entry) => entry.id), ['a', 'b']);
});

test('admission countdown rows skip residents without an anchor and sort open items first', () => {
	const rows = buildAdmissionDrillRows(
		[
			{residentId: 'done', residentName: 'Done', placementDate: '2026-09-01', createdAt: null, latestAdmissionDrill: {id: 'd', drillDate: '2026-09-02', reportYear: 2026}},
			{residentId: 'late', residentName: 'Late', placementDate: '2026-09-01', createdAt: null, latestAdmissionDrill: null},
			{residentId: 'soon', residentName: 'Soon', placementDate: '2026-09-09', createdAt: null, latestAdmissionDrill: null},
			{residentId: 'none', residentName: 'No anchor', placementDate: null, createdAt: null, latestAdmissionDrill: null},
			{residentId: 'created', residentName: 'Created only', placementDate: null, createdAt: '2026-09-10T08:00:00', latestAdmissionDrill: null},
		],
		'2026-09-10'
	);
	assert.deepEqual(rows.map((row) => [row.residentId, row.state, row.deadline]), [
		['late', 'overdue', '2026-09-04'],
		['soon', 'due', '2026-09-12'],
		['created', 'due', '2026-09-13'],
		['done', 'completed', '2026-09-04'],
	]);
});

test('participant validation preserves order and requires a comment for a missing duration', () => {
	const drafts = [
		draft({key: 'b', residentNameSnapshot: 'Bravo'}),
		draft({key: 'a', residentId: '1ee0ac60-91e8-4c3c-832e-e346ad89b4ac', residentNameSnapshot: 'Alpha'}),
	];
	const moved = moveParticipant(drafts, 1, 0);
	const result = validateParticipantDrafts(moved);
	assert.deepEqual(result.errors, []);
	assert.deepEqual(result.participants.map((participant) => [participant.position, participant.residentNameSnapshot]), [[0, 'Alpha'], [1, 'Bravo']]);

	const noTime = validateParticipantDrafts([draft({durationMinutes: '', durationSeconds: '', comment: ''})]);
	assert.match(noTime.errors.join(' '), /explain why no gathering time/i);
	const explained = validateParticipantDrafts([draft({durationMinutes: '', durationSeconds: '', comment: 'Resident was already at the gathering place.'})]);
	assert.deepEqual(explained.errors, []);
	assert.equal(explained.participants[0]?.durationMinutes, null);
});

test('participant validation accepts zero minutes and rejects duplicates and invalid seconds', () => {
	const zeroMinutes = validateParticipantDrafts([draft({durationMinutes: '0', durationSeconds: '5'})]);
	assert.deepEqual(zeroMinutes.errors, []);
	assert.equal(zeroMinutes.participants[0]?.durationMinutes, 0);

	const duplicate = validateParticipantDrafts([draft(), draft({key: 'duplicate'})]);
	assert.match(duplicate.errors.join(' '), /already added/i);
	const duplicateSnapshots = validateParticipantDrafts([
		draft({residentId: null, participantSource: 'manual', residentNameSnapshot: 'Archived Resident'}),
		draft({key: 'snapshot-2', residentId: null, participantSource: 'manual', residentNameSnapshot: 'archived resident'}),
	]);
	assert.match(duplicateSnapshots.errors.join(' '), /already added/i);
	const invalidSeconds = validateParticipantDrafts([draft({durationSeconds: '60'})]);
	assert.match(invalidSeconds.errors.join(' '), /0 through 59/i);
});

test('residents not on the roster can be named without roster ids', () => {
	const result = validateParticipantDrafts([
		draft({
			key: 'manual-one',
			residentId: null,
			participantSource: 'manual',
			residentNameSnapshot: 'New Admission',
		}),
		draft({
			key: 'manual-two',
			residentId: null,
			participantSource: 'manual',
			residentNameSnapshot: 'Former Resident',
		}),
	]);

	assert.deepEqual(result.errors, []);
	assert.deepEqual(
		result.participants.map((participant) => [
			participant.participantSource,
			participant.residentId,
			participant.residentNameSnapshot,
		]),
		[
			['manual', null, 'New Admission'],
			['manual', null, 'Former Resident'],
		]
	);
});

test('staff validation trims names and rejects case-insensitive duplicates', () => {
	assert.deepEqual(validateStaffNames([' Morgan ', 'Taylor']).staffNames, ['Morgan', 'Taylor']);
	assert.match(validateStaffNames(['Morgan', 'morgan']).errors.join(' '), /already added/i);
	assert.match(validateStaffNames([]).errors.join(' '), /at least one staff member/i);
});

test('a no-longer-available roster participant keeps the saved name as an unlinked snapshot', () => {
	const saved = draft({residentNameSnapshot: 'Historical Resident'});
	const [preserved] = preserveUnavailableRosterSnapshots([saved], new Set());
	assert.equal(preserved?.residentId, null);
	assert.equal(preserved?.participantSource, 'manual');
	assert.equal(preserved?.residentNameSnapshot, 'Historical Resident');

	const [available] = preserveUnavailableRosterSnapshots([saved], new Set([saved.residentId as string]));
	assert.equal(available?.participantSource, 'roster');
});

test('legacy pagination returns every source row without grouping', async () => {
	const calls: Array<string | null> = [];
	const rows = await collectLegacyPages(async (cursor) => {
		calls.push(cursor);
		return cursor === null
			? {data: [{id: '1'}, {id: '2'}], nextCursor: '2'}
			: {data: [{id: '3'}], nextCursor: null};
	});
	assert.deepEqual(calls, [null, '2']);
	assert.deepEqual(rows.map((row) => row.id), ['1', '2', '3']);
});

function draft(overrides: Partial<ParticipantDraft> = {}): ParticipantDraft {
	return {
		key: 'resident-1',
		residentId: '0f7f58ef-d1a6-4dd7-a2ca-d4b2bf5a15f8',
		residentNameSnapshot: 'Resident One',
		participantSource: 'roster',
		durationMinutes: '1',
		durationSeconds: '5',
		comment: '',
		...overrides,
	};
}

function report(overrides: Partial<FireDrillReportRecord>): FireDrillReportRecord {
	return {
		id: 'report',
		locationId: '0f7f58ef-d1a6-4dd7-a2ca-d4b2bf5a15f8',
		houseNameSnapshot: 'House A',
		reportYear: 2026,
		drillType: 'scheduled',
		sequence: 1,
		admissionResidentId: null,
		admissionResidentNameSnapshot: null,
		drillDate: '2026-01-01',
		drillTime: '09:00',
		staffNames: ['Staff One'],
		version: 1,
		participants: [],
		...overrides,
	};
}
