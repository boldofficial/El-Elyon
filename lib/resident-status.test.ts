/**
 * DB-free tests for the resident status predicates.
 *
 * These guard the one subtle rule in the module: the test is "is it exactly
 * 'inactive'?", never "is it exactly 'active'?". Rows written before migration
 * 0006 can carry a null status, and reading those as inactive would silently
 * mute every alert for the facility's longest-standing residents -- a failure
 * that shows up as nothing happening, which is the hardest kind to notice.
 *
 * Run with `npm run test:resident-status`.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	INACTIVE_REASONS,
	RESIDENT_ACTIVE,
	RESIDENT_INACTIVE,
	formatResidentDate,
	inactiveDateLabel,
	isActiveResident,
	isInactiveResident,
	onlyActiveResidents,
	residentStatusBadge,
	residentStatusDetail,
} from './resident-status';

test('an explicitly active resident is active', () => {
	assert.equal(isActiveResident({status: RESIDENT_ACTIVE}), true);
	assert.equal(isInactiveResident({status: RESIDENT_ACTIVE}), false);
});

test('an explicitly inactive resident is inactive', () => {
	assert.equal(isActiveResident({status: RESIDENT_INACTIVE}), false);
	assert.equal(isInactiveResident({status: RESIDENT_INACTIVE}), true);
});

test('a missing status is treated as active, not inactive', () => {
	// Pre-0006 rows and any partial select that omits the column.
	assert.equal(isActiveResident({status: null}), true);
	assert.equal(isActiveResident({status: undefined}), true);
	assert.equal(isActiveResident({}), true);
});

test('an unrecognised status is treated as active', () => {
	// The column is a varchar, not an enum. Only the exact string 'inactive'
	// stops alerts; anything else errs towards still caring for the resident.
	assert.equal(isActiveResident({status: 'Inactive'}), true);
	assert.equal(isActiveResident({status: 'archived'}), true);
	assert.equal(isActiveResident({status: ''}), true);
});

test('onlyActiveResidents keeps order and drops just the inactive rows', () => {
	const rows = [
		{id: 'a', status: RESIDENT_ACTIVE},
		{id: 'b', status: RESIDENT_INACTIVE},
		{id: 'c', status: null},
		{id: 'd', status: RESIDENT_INACTIVE},
		{id: 'e', status: RESIDENT_ACTIVE},
	];

	assert.deepEqual(
		onlyActiveResidents(rows).map((r) => r.id),
		['a', 'c', 'e']
	);
});

test('onlyActiveResidents does not mutate its input', () => {
	const rows = [{id: 'a', status: RESIDENT_INACTIVE}];
	onlyActiveResidents(rows);
	assert.equal(rows.length, 1);
});

test('the inactive reasons match what the admin UI and API accept', () => {
	// src/app/api/admin/residents/[id]/profile/route.ts validates against this
	// list, and ResidentProfileManagement.tsx renders one <option> per entry.
	// If they drift, a reason the admin can pick is silently stored as null.
	assert.deepEqual(
		[...INACTIVE_REASONS],
		['deceased', 'placement_terminated', 'discharged']
	);
});

test('formatResidentDate keeps the calendar day of a plain date', () => {
	assert.equal(formatResidentDate('2026-09-03'), 'Sep 3, 2026');
});

test('formatResidentDate reads a UTC-midnight placement timestamp as that day', () => {
	assert.equal(formatResidentDate('2026-09-12T00:00:00.000Z'), 'Sep 12, 2026');
	assert.equal(
		formatResidentDate(new Date('2026-09-12T00:00:00.000Z')),
		'Sep 12, 2026'
	);
});

test('formatResidentDate returns null for missing or junk values', () => {
	assert.equal(formatResidentDate(null), null);
	assert.equal(formatResidentDate(undefined), null);
	assert.equal(formatResidentDate(''), null);
	assert.equal(formatResidentDate('not a date'), null);
});

test('residentStatusBadge treats a missing status as active', () => {
	assert.deepEqual(residentStatusBadge({}), {label: 'Active', tone: 'active'});
	assert.deepEqual(residentStatusBadge({status: 'active', inactiveReason: 'deceased'}), {
		label: 'Active',
		tone: 'active',
	});
});

test('residentStatusBadge names the inactive reason', () => {
	assert.equal(residentStatusBadge({status: 'inactive', inactiveReason: 'deceased'}).label, 'Deceased');
	assert.equal(
		residentStatusBadge({status: 'inactive', inactiveReason: 'placement_terminated'}).label,
		'Terminated'
	);
	assert.equal(residentStatusBadge({status: 'inactive', inactiveReason: 'discharged'}).label, 'Discharged');
	assert.equal(residentStatusBadge({status: 'inactive', inactiveReason: null}).label, 'Inactive');
});

test('residentStatusDetail shows active since the placement date', () => {
	assert.equal(
		residentStatusDetail({status: 'active', placementDate: '2025-03-01T00:00:00.000Z'}),
		'Active since Mar 1, 2025'
	);
	assert.equal(residentStatusDetail({status: 'active'}), 'Active (no placement date on file)');
});

test('residentStatusDetail shows the leaving date for inactive residents', () => {
	assert.equal(
		residentStatusDetail({status: 'inactive', inactiveReason: 'deceased', inactiveDate: '2026-09-03'}),
		'Deceased on Sep 3, 2026'
	);
	assert.equal(
		residentStatusDetail({
			status: 'inactive',
			inactiveReason: 'placement_terminated',
			inactiveDate: '2026-08-15',
		}),
		'Placement terminated on Aug 15, 2026'
	);
	assert.equal(
		residentStatusDetail({status: 'inactive', inactiveReason: 'discharged'}),
		'Discharged (date not recorded)'
	);
	assert.equal(
		residentStatusDetail({status: 'inactive', inactiveDate: '2026-01-02'}),
		'Inactive on Jan 2, 2026'
	);
});

test('inactiveDateLabel matches the reason', () => {
	assert.equal(inactiveDateLabel('deceased'), 'Date of Death');
	assert.equal(inactiveDateLabel('placement_terminated'), 'Termination Date');
	assert.equal(inactiveDateLabel('discharged'), 'Discharge Date');
	assert.equal(inactiveDateLabel(null), 'Inactive Since');
});
