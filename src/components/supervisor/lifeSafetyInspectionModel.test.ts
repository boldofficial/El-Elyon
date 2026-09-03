import assert from 'node:assert/strict';
import test from 'node:test';
import {
	buildAnnualInspectionRows,
	formatLocalInspectionDate,
	initialsFromName,
	inspectionDateBounds,
	type LifeSafetyInspectionEntry,
} from './lifeSafetyInspectionModel';

test('annual inspection rows keep categories independent and retain blank months', () => {
	const smoke = entry({equipmentType: 'smoke', inspectionDate: '2026-01-03'});
	const co = entry({id: 'co', equipmentType: 'carbon_monoxide', inspectionDate: '2026-01-05'});
	const extinguisher = entry({id: 'ext', equipmentType: 'fire_extinguisher', inspectionDate: '2026-01-12'});
	const rows = buildAnnualInspectionRows([smoke, co, extinguisher]);

	assert.equal(rows.length, 12);
	assert.equal(rows[0]?.entries.smoke, smoke);
	assert.equal(rows[0]?.entries.carbon_monoxide, co);
	assert.equal(rows[0]?.entries.fire_extinguisher, extinguisher);
	assert.deepEqual(rows[1]?.entries, {
		smoke: undefined,
		carbon_monoxide: undefined,
		fire_extinguisher: undefined,
	});
});

test('date bounds follow the selected reporting month, including leap years', () => {
	assert.deepEqual(inspectionDateBounds(2028, 2), {
		minimum: '2028-02-01',
		maximum: '2028-02-29',
	});
	assert.deepEqual(inspectionDateBounds(2026, 4), {
		minimum: '2026-04-01',
		maximum: '2026-04-30',
	});
});

test('local dates format without timezone conversion and initials derive from a name', () => {
	assert.equal(formatLocalInspectionDate('2026-01-01'), '01/01/2026');
	assert.equal(formatLocalInspectionDate('2026-01-01T00:00:00.000Z'), '01/01/2026');
	assert.equal(initialsFromName('  Morgan A. Smith '), 'MAS');
});

function entry(overrides: Partial<LifeSafetyInspectionEntry>): LifeSafetyInspectionEntry {
	return {
		id: 'smoke',
		locationId: '0f7f58ef-d1a6-4dd7-a2ca-d4b2bf5a15f8',
		houseNameSnapshot: 'House A',
		reportYear: 2026,
		reportMonth: 1,
		equipmentType: 'smoke',
		inspectionDate: '2026-01-01',
		staffInitials: 'MS',
		outcome: 'pass',
		notes: null,
		version: 1,
		...overrides,
	};
}
