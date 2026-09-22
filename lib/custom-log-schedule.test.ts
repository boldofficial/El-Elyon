import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	clockTimeInTimeZone,
	deriveSlotStates,
	deriveSlotsNeedingAttention,
} from './custom-log-schedule';
import {CARB_LOG_SCHEDULE} from './carb-log';

const statuses = (now: `${number}${number}:${number}${number}`, logged: string[] = []) =>
	deriveSlotStates({
		schedule: CARB_LOG_SCHEDULE,
		loggedSlotKeys: new Set(logged),
		now,
	}).map((s) => `${s.slot.key}:${s.status}`);

test('early morning: nothing flagged yet', () => {
	assert.deepEqual(statuses('05:30'), [
		'breakfast:upcoming',
		'lunch:upcoming',
		'dinner:upcoming',
	]);
	assert.equal(
		deriveSlotsNeedingAttention({
			schedule: CARB_LOG_SCHEDULE,
			loggedSlotKeys: new Set(),
			now: '05:30',
		}).length,
		0
	);
});

test('inside a window the slot is open; a closed window with no entry is missed', () => {
	assert.deepEqual(statuses('12:00'), [
		'breakfast:missed',
		'lunch:open',
		'dinner:upcoming',
	]);
});

test('a logged slot stays logged even after its window closes', () => {
	assert.deepEqual(statuses('21:00', ['breakfast', 'lunch']), [
		'breakfast:logged',
		'lunch:logged',
		'dinner:missed',
	]);
});

test('window edges are inclusive', () => {
	assert.equal(statuses('06:00')[0], 'breakfast:open');
	assert.equal(statuses('10:00')[0], 'breakfast:open');
	assert.equal(statuses('10:01')[0], 'breakfast:missed');
});

test('clockTimeInTimeZone renders 24h wall-clock in the given zone', () => {
	// 2026-09-21T03:30Z is 23:30 the previous evening in New York (EDT).
	assert.equal(
		clockTimeInTimeZone(new Date('2026-09-21T03:30:00Z'), 'America/New_York'),
		'23:30'
	);
	assert.equal(
		clockTimeInTimeZone(new Date('2026-09-21T03:30:00Z'), 'UTC'),
		'03:30'
	);
});
