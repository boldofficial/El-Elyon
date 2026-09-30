import assert from 'node:assert/strict';
import test from 'node:test';

import {
	formatResidentDate,
	inactiveDateLabel,
	residentStatusBadge,
	residentStatusDetail,
} from './resident-status';

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
