import assert from 'node:assert/strict';
import test from 'node:test';
import type {InspectorLifeSafetyData} from '@/lib/inspector-life-safety-projection';
import {
	buildInspectorAnnualInspectionRows,
	filterInspectorLifeSafetyYear,
	formatInspectorLocalDate,
	inspectorFireDrillForSequence,
	inspectorYears,
} from './lifeSafetyPresentation';

test('annual inspector rows retain twelve months and independent equipment facts', () => {
	const rows = buildInspectorAnnualInspectionRows(data().inspections, 2026);
	assert.equal(rows.length, 12);
	assert.equal(rows[0]?.entries.smoke?.staffInitials, 'MS');
	assert.equal(rows[0]?.entries.carbon_monoxide, undefined);
	assert.deepEqual(rows[1]?.entries, {});
});

test('year filtering keeps normalized and legacy facts distinct and ungrouped', () => {
	const source = data();
	const selected = filterInspectorLifeSafetyYear(source, 2026);
	assert.equal(selected.inspections.length, 1);
	assert.equal(selected.fireDrills.length, 1);
	assert.equal(selected.legacySmokeChecks.length, 2);
	assert.equal(selected.legacyFireDrills.length, 2);
	assert.deepEqual(selected.legacyFireDrills.map((row) => row.residentName), ['Resident A', 'Resident B']);
	assert.deepEqual(inspectorYears(source, 2027), [2027, 2026, 2025]);
});

test('local dates and sequence selection do not shift dates or substitute missing reports', () => {
	assert.equal(formatInspectorLocalDate('2026-01-01T00:00:00.000Z'), '01/01/2026');
	assert.equal(inspectorFireDrillForSequence(data().fireDrills, 1)?.staffNames[0], 'Morgan');
	assert.equal(inspectorFireDrillForSequence(data().fireDrills, 2), undefined);
});

function data(): InspectorLifeSafetyData {
	return {
		houseName: 'House A',
		inspections: [{
			reportYear: 2026, reportMonth: 1, equipmentType: 'smoke', inspectionDate: '2026-01-01',
			staffInitials: 'MS', outcome: 'pass', notes: null,
		}],
		fireDrills: [{
			reportYear: 2026, sequence: 1, drillDate: '2026-03-01', drillTime: '09:00:00',
			staffNames: ['Morgan'], participants: [],
		}],
		legacySmokeChecks: [
			{date: '2026-02-01T00:00:00.000Z', smokeStatus: 'Pass', coStatus: 'Pass', staffInitials: 'MS', notes: null},
			{date: '2026-02-15T00:00:00.000Z', smokeStatus: 'Fail', coStatus: 'Pass', staffInitials: 'TS', notes: 'Battery'},
			{date: '2025-12-01T00:00:00.000Z', smokeStatus: 'Pass', coStatus: 'Pass', staffInitials: 'MS', notes: null},
		],
		legacyFireDrills: [
			{year: 2026, sequence: 1, residentName: 'Resident A', date: '2026-03-01T00:00:00.000Z', time: '09:00', staffName: 'Morgan', comment: null},
			{year: 2026, sequence: 1, residentName: 'Resident B', date: '2026-03-01T00:00:00.000Z', time: '09:00', staffName: 'Morgan', comment: null},
		],
	};
}
