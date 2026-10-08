import assert from 'node:assert/strict';
import test from 'node:test';

import {
	CARE_LOG_EDIT_WINDOW_MS,
	daysBetween,
	formatLoggedForDate,
	isWithinCareLogEditWindow,
	lateEntryDateError,
	shiftDate,
} from './care-log-policy';

const SUBMITTED = new Date('2026-09-16T15:00:00.000Z');

test('the author can still edit just inside the 14-day window', () => {
	const now = new Date(SUBMITTED.getTime() + CARE_LOG_EDIT_WINDOW_MS - 60_000);
	assert.equal(isWithinCareLogEditWindow(SUBMITTED, now), true);
});

test('editing closes once 14 days have passed since submission', () => {
	const now = new Date(SUBMITTED.getTime() + CARE_LOG_EDIT_WINDOW_MS + 1);
	assert.equal(isWithinCareLogEditWindow(SUBMITTED, now), false);
});

test('a log with no usable submission time is not editable', () => {
	assert.equal(isWithinCareLogEditWindow(null), false);
	assert.equal(isWithinCareLogEditWindow('not a date'), false);
});

test('calendar-day arithmetic ignores DST and month ends', () => {
	assert.equal(daysBetween('2026-10-25', '2026-11-08'), 14); // spans DST end
	assert.equal(shiftDate('2026-09-30', -14), '2026-09-16');
	assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('formats the logged-for day without drifting across timezones', () => {
	assert.equal(formatLoggedForDate('2026-09-20'), 'Sep 20, 2026');
});

const TODAY = '2026-09-30';

test('a late entry must name a real day', () => {
	assert.notEqual(lateEntryDateError(undefined, TODAY), null);
	assert.notEqual(lateEntryDateError('2026-02-30', TODAY), null);
	assert.notEqual(lateEntryDateError('09/20/2026', TODAY), null);
});

test('yesterday is a valid late entry', () => {
	assert.equal(lateEntryDateError('2026-09-29', TODAY), null);
});

test('today and future days are not late entries', () => {
	assert.notEqual(lateEntryDateError(TODAY, TODAY), null);
	assert.notEqual(lateEntryDateError('2026-10-01', TODAY), null);
});

test('day 14 is the last allowed day; day 15 is refused', () => {
	assert.equal(lateEntryDateError('2026-09-16', TODAY), null);
	assert.notEqual(lateEntryDateError('2026-09-15', TODAY), null);
	assert.notEqual(lateEntryDateError('2026-09-01', TODAY), null);
});
