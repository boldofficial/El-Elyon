import assert from 'node:assert/strict';
import test from 'node:test';
import {canAddToRoster, canViewHome, isCalendarDate, parseStaffProfileUpdate} from './staff-directory';

const TODAY = '2026-10-12';

test('calendar dates must exist', () => {
	assert.equal(isCalendarDate('2024-02-29'), true);
	assert.equal(isCalendarDate('2023-02-29'), false);
	assert.equal(isCalendarDate('2024-13-01'), false);
	assert.equal(isCalendarDate('08/08/2024'), false);
});

test('only fields present in the body are updated; blanks clear', () => {
	const result = parseStaffProfileUpdate({phone: ' 608 555 0100 ', homeAddress: ''}, TODAY);
	assert.deepEqual(result, {ok: true, update: {phone: '608 555 0100', homeAddress: null}});
});

test('dates are validated and birth dates must be in the past', () => {
	assert.equal(parseStaffProfileUpdate({dateOfBirth: '1990-05-17'}, TODAY).ok, true);
	assert.equal(parseStaffProfileUpdate({dateOfBirth: TODAY}, TODAY).ok, false);
	assert.equal(parseStaffProfileUpdate({dateOfHire: '2024-02-30'}, TODAY).ok, false);
	assert.deepEqual(parseStaffProfileUpdate({dateOfHire: ''}, TODAY), {ok: true, update: {dateOfHire: null}});
});

test('sex and status only take their listed values', () => {
	assert.equal(parseStaffProfileUpdate({sex: 'female'}, TODAY).ok, true);
	assert.equal(parseStaffProfileUpdate({sex: 'F'}, TODAY).ok, false);
	assert.equal(parseStaffProfileUpdate({employmentStatus: 'inactive'}, TODAY).ok, true);
	// 'pending' is an invite state, not something the directory sets.
	assert.equal(parseStaffProfileUpdate({employmentStatus: 'pending'}, TODAY).ok, false);
});

test('name, email and unknown keys are ignored, so they cannot be changed here', () => {
	assert.equal(parseStaffProfileUpdate({name: 'Someone Else', workEmail: 'x@y.z'}, TODAY).ok, false);
	assert.deepEqual(parseStaffProfileUpdate({name: 'X', phone: '1'}, TODAY), {
		ok: true,
		update: {phone: '1'},
	});
});

test('over-long text and wrong types are refused', () => {
	assert.equal(parseStaffProfileUpdate({phone: 'x'.repeat(51)}, TODAY).ok, false);
	assert.equal(parseStaffProfileUpdate({phone: 6085550100}, TODAY).ok, false);
	assert.equal(parseStaffProfileUpdate(null, TODAY).ok, false);
});

test('admins open any home; supervisors only their own', () => {
	assert.equal(canViewHome({role: 'admin', locations: []}, 'PRAISE HOME'), true);
	assert.equal(canViewHome({role: 'supervisor', locations: ['PRAISE HOME']}, 'PRAISE HOME'), true);
	assert.equal(canViewHome({role: 'supervisor', locations: ['PRAISE HOME']}, 'SHALOM FAMILY HOME'), false);
});

test('a supervisor rosters only staff the app assigns to one of their homes', () => {
	const manager = {role: 'supervisor', locations: ['PRAISE HOME']};
	assert.equal(canAddToRoster(manager, 'PRAISE HOME', ['PRAISE HOME', 'GRACE FAMILY HOME']), true);
	// Not assigned there: rostering would open their file to this supervisor.
	assert.equal(canAddToRoster(manager, 'PRAISE HOME', ['GRACE FAMILY HOME']), false);
	assert.equal(canAddToRoster(manager, 'PRAISE HOME', []), false);
	// Assigned there, but it isn't the supervisor's home.
	assert.equal(canAddToRoster(manager, 'GRACE FAMILY HOME', ['GRACE FAMILY HOME']), false);
	assert.equal(canAddToRoster({role: 'admin', locations: []}, 'GRACE FAMILY HOME', []), true);
});
