import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	buildMonthWeeks,
	monthOf,
	sameMonth,
	shiftMonth,
	summarizeTaskDays,
} from './task-calendar';

test('monthOf reads year and month from an ISO date', () => {
	assert.deepEqual(monthOf('2026-11-12'), {year: 2026, month: 11});
});

test('shiftMonth crosses year boundaries in both directions', () => {
	assert.deepEqual(shiftMonth({year: 2026, month: 12}, 1), {year: 2027, month: 1});
	assert.deepEqual(shiftMonth({year: 2026, month: 1}, -1), {year: 2025, month: 12});
	assert.deepEqual(shiftMonth({year: 2026, month: 11}, -11), {year: 2025, month: 12});
	assert.equal(sameMonth(shiftMonth({year: 2026, month: 11}, 0), {year: 2026, month: 11}), true);
});

test('November 2026 starts on a Sunday and fills five whole weeks', () => {
	const weeks = buildMonthWeeks({year: 2026, month: 11});
	assert.equal(weeks.length, 5);
	assert.ok(weeks.every((week) => week.length === 7));
	assert.deepEqual(weeks[0][0], {date: '2026-11-01', dayOfMonth: 1, inMonth: true});
	// 30 Nov is a Monday; the rest of that row is borrowed from December.
	assert.deepEqual(weeks[4][1], {date: '2026-11-30', dayOfMonth: 30, inMonth: true});
	assert.deepEqual(weeks[4][6], {date: '2026-12-05', dayOfMonth: 5, inMonth: false});
});

test('a month starting midweek borrows leading days from the month before', () => {
	// 1 Oct 2026 is a Thursday.
	const weeks = buildMonthWeeks({year: 2026, month: 10});
	assert.deepEqual(weeks[0][0], {date: '2026-09-27', dayOfMonth: 27, inMonth: false});
	assert.deepEqual(weeks[0][4], {date: '2026-10-01', dayOfMonth: 1, inMonth: true});
});

test('February in a leap year has 29 days', () => {
	const days = buildMonthWeeks({year: 2028, month: 2}).flat().filter((d) => d.inMonth);
	assert.equal(days.length, 29);
	assert.equal(days[28].date, '2028-02-29');
});

test('days are marked due or overdue, and counted', () => {
	const days = summarizeTaskDays(
		[
			{dueDate: '2026-11-10'},
			{dueDate: '2026-11-10'},
			{dueDate: '2026-11-12'},
			{dueDate: '2026-11-20'},
		],
		'2026-11-12'
	);
	assert.deepEqual(days.get('2026-11-10'), {mark: 'overdue', count: 2});
	// Due today is not overdue until the operational day rolls over.
	assert.deepEqual(days.get('2026-11-12'), {mark: 'due', count: 1});
	assert.deepEqual(days.get('2026-11-20'), {mark: 'due', count: 1});
	assert.equal(days.get('2026-11-13'), undefined);
});
