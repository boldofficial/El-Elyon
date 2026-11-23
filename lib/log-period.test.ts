import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	RECENT_PERIOD,
	monthLabel,
	monthRange,
	parseMonthKey,
	periodOptions,
	printMonthFor,
} from './log-period';

test('monthRange covers the whole month, including leap February', () => {
	assert.deepEqual(monthRange('2026-11'), {from: '2026-11-01', to: '2026-11-30'});
	assert.deepEqual(monthRange('2026-12'), {from: '2026-12-01', to: '2026-12-31'});
	assert.deepEqual(monthRange('2028-02'), {from: '2028-02-01', to: '2028-02-29'});
	assert.deepEqual(monthRange('2027-02'), {from: '2027-02-01', to: '2027-02-28'});
});

test('parseMonthKey rejects anything that is not a real YYYY-MM', () => {
	assert.equal(parseMonthKey(RECENT_PERIOD), null);
	assert.equal(parseMonthKey('2026-13'), null);
	assert.equal(parseMonthKey('2026-1'), null);
	assert.deepEqual(parseMonthKey('2026-01'), {year: 2026, month: 1});
});

test('periodOptions starts with the recent window and walks back across the year', () => {
	const options = periodOptions('2026-02-03', 4);
	assert.deepEqual(
		options.map((o) => o.value),
		[RECENT_PERIOD, '2026-02', '2026-01', '2025-12', '2025-11']
	);
	assert.equal(options[1].label, 'This month (February 2026)');
	assert.equal(options[3].label, 'December 2025');
});

test('printMonthFor prints the chosen month, or this month for the recent window', () => {
	assert.equal(printMonthFor('2026-08', '2026-11-23'), '2026-08');
	assert.equal(printMonthFor(RECENT_PERIOD, '2026-11-23'), '2026-11');
});

test('monthLabel does not drift a month in negative-offset time zones', () => {
	assert.equal(monthLabel('2026-01'), 'January 2026');
});
