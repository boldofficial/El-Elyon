import assert from 'node:assert/strict';
import test from 'node:test';
import {createMissedShiftHandlers, type NewMissedShift} from './handler';
import type {ShiftSpan} from '@/lib/missed-shift';

const ENDPOINT = 'http://localhost/api/supervisor/missed-shifts';
const NOW = new Date('2026-10-09T18:00:00.000Z'); // 1 PM, Oct 9, in Chicago
const MAPLE = {id: '11111111-1111-4111-8111-111111111111', name: 'Maple House'};

const roles: Record<string, {role: string; locations: string[]}> = {
	'admin-1': {role: 'admin', locations: []},
	'sup-1': {role: 'supervisor', locations: ['Maple House']},
	'staff-1': {role: 'staff', locations: ['Maple House']},
	'staff-2': {role: 'staff', locations: ['Maple House']},
};

function handlersFor(userId: string | null, existingShifts: ShiftSpan[] = []) {
	const inserted: NewMissedShift[] = [];
	const audited: string[] = [];
	const handlers = createMissedShiftHandlers({
		getUserId: async () => userId,
		getRole: async (id) => roles[id] ?? null,
		listActiveLocationNames: async () => ['Maple House', 'Oak'],
		listPeople: async () => [
			{clerkUserId: 'staff-1', role: 'staff', locations: ['Maple House'], name: 'Pat'},
			{clerkUserId: 'staff-oak', role: 'staff', locations: ['Oak'], name: 'Oak Only'},
		],
		resolveLocation: async (name) => (name === MAPLE.name ? MAPLE : null),
		getTimeZone: async () => 'America/Chicago',
		findShiftsBetween: async () => existingShifts,
		insertShift: async (shift) => {
			inserted.push(shift);
			return {id: 'new-shift'};
		},
		audit: async ({actorId, shift}) => {
			audited.push(`${actorId}:${shift.clerkUserId}:${shift.location}`);
		},
		now: () => NOW,
	});
	return {...handlers, inserted, audited};
}

function post(body: Record<string, unknown>) {
	return new Request(ENDPOINT, {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify(body),
	});
}

const form = {
	staffId: 'staff-1',
	location: 'Maple House',
	shiftSlot: 1,
	date: '2026-10-05',
	clockIn: '07:00',
	clockOut: '15:00',
};

test('a supervisor records a missed shift: closed, frozen like a clock-in, flagged, audited', async () => {
	const {POST, inserted, audited} = handlersFor('sup-1');
	const res = await POST(post(form));

	assert.equal(res.status, 201);
	assert.deepEqual(await res.json(), {id: 'new-shift'});
	assert.deepEqual(inserted, [
		{
			clerkUserId: 'staff-1',
			location: 'Maple House',
			locationId: MAPLE.id,
			shiftSlot: 1,
			operationalDate: '2026-10-05',
			operationalTimeZoneSnapshot: 'America/Chicago',
			clockInTime: new Date('2026-10-05T12:00:00.000Z'),
			clockOutTime: new Date('2026-10-05T20:00:00.000Z'),
			deviceId: 'missed-shift-entry',
			enteredBy: 'sup-1',
			enteredAt: NOW,
		},
	]);
	assert.deepEqual(audited, ['sup-1:staff-1:Maple House']);
});

test('an overnight 3rd shift belongs to the day it started', async () => {
	const {POST, inserted} = handlersFor('admin-1');
	const res = await POST(post({...form, shiftSlot: 3, clockIn: '23:00', clockOut: '07:00'}));

	assert.equal(res.status, 201);
	assert.equal(inserted[0].operationalDate, '2026-10-05');
	assert.equal(inserted[0].clockOutTime.toISOString(), '2026-10-06T12:00:00.000Z');
});

test('signed-out gets 401 and staff get 403; nothing is written', async () => {
	for (const [userId, status] of [
		[null, 401],
		['staff-2', 403],
	] as const) {
		const {POST, GET, inserted} = handlersFor(userId);
		assert.equal((await POST(post(form))).status, status);
		assert.equal((await GET()).status, status);
		assert.deepEqual(inserted, []);
	}
});

test('a supervisor cannot record their own shift', async () => {
	const {POST, inserted} = handlersFor('sup-1');
	const res = await POST(post({...form, staffId: 'sup-1'}));

	assert.equal(res.status, 403);
	assert.match((await res.json()).error, /your own/);
	assert.deepEqual(inserted, []);
});

test('more than 14 days back, or a shift still running, is refused', async () => {
	const {POST, inserted} = handlersFor('sup-1');
	assert.equal((await POST(post({...form, date: '2026-09-24'}))).status, 400);
	// Oct 9, 8 AM to 5 PM: it is only 1 PM.
	assert.equal((await POST(post({...form, date: '2026-10-09', clockIn: '08:00', clockOut: '17:00'}))).status, 400);
	assert.deepEqual(inserted, []);
});

test('a shift overlapping one the worker already has gets 409', async () => {
	const {POST, inserted} = handlersFor('sup-1', [
		{clockInTime: new Date('2026-10-05T19:00:00.000Z'), clockOutTime: new Date('2026-10-06T03:00:00.000Z')},
	]);
	const res = await POST(post(form));

	assert.equal(res.status, 409);
	assert.deepEqual(inserted, []);
});

test('unknown staff gets 404 and an inactive house gets 400', async () => {
	const {POST} = handlersFor('admin-1');
	assert.equal((await POST(post({...form, staffId: 'nobody'}))).status, 404);
	assert.equal((await POST(post({...form, location: 'Closed House'}))).status, 400);
});

test('GET offers a supervisor only their houses and the staff there', async () => {
	const {GET} = handlersFor('sup-1');
	const res = await GET();

	assert.equal(res.status, 200);
	assert.equal(res.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(await res.json(), {
		locations: ['Maple House'],
		staff: [{id: 'staff-1', name: 'Pat', locations: ['Maple House']}],
	});
});

test('an unexpected failure is a 500 with a plain message', async () => {
	const {POST} = createMissedShiftHandlers({
		getUserId: async () => 'sup-1',
		getRole: async (id) => roles[id] ?? null,
		listActiveLocationNames: async () => [],
		listPeople: async () => [],
		resolveLocation: async () => MAPLE,
		getTimeZone: async () => {
			throw new Error('config missing');
		},
		findShiftsBetween: async () => [],
		insertShift: async () => ({id: 'x'}),
		audit: async () => {},
		now: () => NOW,
	});
	const res = await POST(post(form));
	assert.equal(res.status, 500);
	assert.match((await res.json()).error, /Could not record/);
});
