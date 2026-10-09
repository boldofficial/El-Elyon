import assert from 'node:assert/strict';
import test from 'node:test';
import {
	missedShiftAccessError,
	missedShiftOptions,
	missedShiftTimes,
	missedShiftWindowError,
	overlapsExistingShift,
	parseMissedShiftInput,
} from './missed-shift';

const TZ = 'America/Chicago';

const admin = {clerkUserId: 'admin-1', role: 'admin', locations: []};
const supervisor = {clerkUserId: 'sup-1', role: 'supervisor', locations: ['Maple House']};
const staff = {clerkUserId: 'staff-1', role: 'staff', locations: ['Maple House']};

const validBody = {
	staffId: 'staff-1',
	location: 'Maple House',
	shiftSlot: 1,
	date: '2026-10-05',
	clockIn: '07:00',
	clockOut: '15:00',
};

test('parse accepts a complete form and rejects missing or malformed fields', () => {
	assert.deepEqual(parseMissedShiftInput(validBody), {ok: true, value: validBody});
	for (const [field, value] of [
		['staffId', ''],
		['location', '  '],
		['shiftSlot', 4],
		['date', '2026-02-30'],
		['clockIn', '7:00'],
		['clockOut', '24:00'],
	] as const) {
		assert.equal(parseMissedShiftInput({...validBody, [field]: value}).ok, false, field);
	}
	assert.equal(parseMissedShiftInput({...validBody, clockOut: '07:00'}).ok, false, 'zero-length shift');
	assert.equal(parseMissedShiftInput(null).ok, false);
});

test('times are wall-clock in the organization timezone', () => {
	const {clockInTime, clockOutTime} = missedShiftTimes(validBody, TZ);
	// October in Chicago is CDT, UTC-5.
	assert.equal(clockInTime.toISOString(), '2026-10-05T12:00:00.000Z');
	assert.equal(clockOutTime.toISOString(), '2026-10-05T20:00:00.000Z');
});

test('a clock-out earlier than the clock-in is the next morning', () => {
	const {clockInTime, clockOutTime} = missedShiftTimes(
		{date: '2026-10-05', clockIn: '23:00', clockOut: '07:00'},
		TZ
	);
	assert.equal(clockInTime.toISOString(), '2026-10-06T04:00:00.000Z');
	assert.equal(clockOutTime.toISOString(), '2026-10-06T12:00:00.000Z');
});

test('admins may record for anyone but themselves', () => {
	assert.equal(missedShiftAccessError(admin, staff, 'Maple House'), null);
	assert.equal(missedShiftAccessError(admin, supervisor, 'Maple House'), null);
	assert.match(missedShiftAccessError(admin, admin, 'Maple House') ?? '', /your own/);
});

test('supervisors may record for staff at their own houses only', () => {
	assert.equal(missedShiftAccessError(supervisor, staff, 'Maple House'), null);
	assert.match(
		missedShiftAccessError(supervisor, {...staff, locations: ['Oak']}, 'Oak') ?? '',
		/your own houses/
	);
});

test('supervisors cannot record their own shift or an admin shift', () => {
	assert.match(missedShiftAccessError(supervisor, supervisor, 'Maple House') ?? '', /your own/);
	assert.match(
		missedShiftAccessError(supervisor, {...admin, locations: ['Maple House']}, 'Maple House') ?? '',
		/admin/
	);
});

test('staff cannot record shifts at all', () => {
	const otherStaff = {...staff, clerkUserId: 'staff-2'};
	assert.match(missedShiftAccessError(otherStaff, staff, 'Maple House') ?? '', /supervisors and admins/);
});

test('the worker must be assigned to the house, even for an admin', () => {
	assert.match(missedShiftAccessError(admin, staff, 'Oak') ?? '', /not assigned/);
});

test('window: today back to 14 days, never the future, never a shift still running', () => {
	const now = new Date('2026-10-09T18:00:00.000Z'); // 1 PM in Chicago
	const ended = {clockOutTime: new Date('2026-10-09T17:00:00.000Z')};
	assert.equal(missedShiftWindowError('2026-10-09', ended, '2026-10-09', now), null, 'today');
	assert.equal(missedShiftWindowError('2026-09-25', ended, '2026-10-09', now), null, 'day 14');
	assert.match(missedShiftWindowError('2026-09-24', ended, '2026-10-09', now) ?? '', /14 days/);
	assert.match(missedShiftWindowError('2026-10-10', ended, '2026-10-09', now) ?? '', /future/);
	const stillRunning = {clockOutTime: new Date('2026-10-09T20:00:00.000Z')};
	assert.match(missedShiftWindowError('2026-10-09', stillRunning, '2026-10-09', now) ?? '', /hasn't ended/);
});

test('overlap: touching shifts are fine, overlapping or open ones are not', () => {
	const now = new Date('2026-10-09T18:00:00.000Z');
	const recorded = {
		clockInTime: new Date('2026-10-05T12:00:00.000Z'),
		clockOutTime: new Date('2026-10-05T20:00:00.000Z'),
	};
	const before = {clockInTime: new Date('2026-10-05T04:00:00.000Z'), clockOutTime: new Date('2026-10-05T12:00:00.000Z')};
	const overlapping = {clockInTime: new Date('2026-10-05T19:00:00.000Z'), clockOutTime: new Date('2026-10-06T03:00:00.000Z')};
	const openSinceMorning = {clockInTime: new Date('2026-10-05T13:00:00.000Z'), clockOutTime: null};
	assert.equal(overlapsExistingShift(recorded, [before], now), false);
	assert.equal(overlapsExistingShift(recorded, [overlapping], now), true);
	assert.equal(overlapsExistingShift(recorded, [openSinceMorning], now), true);
});

test('options: supervisors see their houses and the staff there, never themselves or admins', () => {
	const people = [
		{...staff, name: 'Pat'},
		{clerkUserId: 'staff-oak', role: 'staff', locations: ['Oak'], name: 'Oak Only'},
		{clerkUserId: 'sup-2', role: 'supervisor', locations: ['Maple House', 'Oak'], name: 'Sam'},
		{...supervisor, name: 'Me'},
		{clerkUserId: 'admin-2', role: 'admin', locations: ['Maple House'], name: 'Boss'},
	];
	assert.deepEqual(missedShiftOptions(supervisor, ['Oak', 'Maple House'], people), {
		locations: ['Maple House'],
		staff: [
			{id: 'staff-1', name: 'Pat', locations: ['Maple House']},
			{id: 'sup-2', name: 'Sam', locations: ['Maple House']},
		],
	});
	const forAdmin = missedShiftOptions(admin, ['Oak', 'Maple House'], people);
	assert.deepEqual(forAdmin.locations, ['Maple House', 'Oak']);
	assert.deepEqual(
		forAdmin.staff.map((person) => person.id),
		['sup-1', 'staff-oak', 'staff-1', 'sup-2']
	);
});
