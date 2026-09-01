import assert from 'node:assert/strict';
import test from 'node:test';
import {
	InspectorLifeSafetyScopeError,
	projectInspectorLifeSafetyData,
	requireExactlyOneActiveInspectorLocation,
} from './inspector-life-safety-projection';

test('inspector location resolution fails closed for missing or ambiguous active names', () => {
	assert.throws(() => requireExactlyOneActiveInspectorLocation([], 'House A'), InspectorLifeSafetyScopeError);
	assert.throws(
		() => requireExactlyOneActiveInspectorLocation([
			{id: 'one', name: 'House A'},
			{id: 'two', name: 'House A'},
		], 'House A'),
		InspectorLifeSafetyScopeError
	);
	assert.throws(
		() => requireExactlyOneActiveInspectorLocation([{id: 'one', name: 'House B'}], 'House A'),
		InspectorLifeSafetyScopeError
	);
	assert.deepEqual(
		requireExactlyOneActiveInspectorLocation([{id: 'one', name: 'House A'}], 'House A'),
		{id: 'one', name: 'House A'}
	);
});

test('projection allowlists recorded facts and strips identifiers and mutation metadata', () => {
	const data = projectInspectorLifeSafetyData({
		location: {id: 'location-secret', name: 'House A'},
		inspections: [{
			id: 'inspection-secret', locationId: 'location-secret', createdBy: 'clerk-secret', version: 9,
			reportYear: 2026, reportMonth: 1, equipmentType: 'smoke', inspectionDate: '2026-01-02',
			staffInitials: 'MS', outcome: 'pass', notes: null,
		}],
		fireDrills: [{
			id: 'report-secret', locationId: 'location-secret', createdBy: 'clerk-secret', version: 4,
			reportYear: 2026, sequence: 1, drillDate: '2026-02-03', drillTime: '09:15:00', staffNames: ['Morgan'],
		}],
		participants: [{
			id: 'participant-secret', fireDrillReportId: 'report-secret', residentId: 'resident-secret',
			residentNameSnapshot: 'Resident One', durationMinutes: 0, durationSeconds: 42,
			comment: null, position: 0,
		}],
		legacySmokeChecks: [{
			id: 'legacy-secret', createdBy: 'clerk-secret', date: new Date('2026-01-04T00:00:00.000Z'),
			smokeStatus: 'Pass', coStatus: 'Pass', staffInitials: 'MS', notes: null,
		}],
		legacyFireDrills: [{
			id: 'legacy-fire-secret', createdBy: 'clerk-secret', year: 2026, sequence: 2,
			residentName: 'Resident Two', date: new Date('2026-07-04T00:00:00.000Z'), time: '10:00',
			staffName: 'Morgan', comment: null,
		}],
	});

	assert.equal(data.houseName, 'House A');
	assert.deepEqual(Object.keys(data.inspections[0]!).sort(), [
		'equipmentType', 'inspectionDate', 'notes', 'outcome', 'reportMonth', 'reportYear', 'staffInitials',
	].sort());
	assert.deepEqual(Object.keys(data.fireDrills[0]!).sort(), [
		'drillDate', 'drillTime', 'participants', 'reportYear', 'sequence', 'staffNames',
	].sort());
	assert.deepEqual(Object.keys(data.fireDrills[0]!.participants[0]!).sort(), [
		'comment', 'durationMinutes', 'durationSeconds', 'position', 'residentNameSnapshot',
	].sort());
	assert.doesNotMatch(JSON.stringify(data), /secret|createdBy|locationId|residentId|version/);
});
