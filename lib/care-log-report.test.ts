import assert from 'node:assert/strict';
import test from 'node:test';

import {
	MAX_REPORT_DAYS,
	addDays,
	localDayStartUtc,
	parseReportRange,
	reportWindowUtc,
} from './care-log-report';

test('accepts an inclusive single-day and a full-year range', () => {
	assert.deepEqual(parseReportRange('2026-09-01', '2026-09-01'), {
		ok: true,
		from: '2026-09-01',
		to: '2026-09-01',
	});
	assert.equal(parseReportRange('2025-10-01', '2026-09-30').ok, true);
});

test('rejects missing, malformed, impossible, and reversed dates', () => {
	for (const [from, to] of [
		[null, '2026-09-01'],
		['2026-09-01', undefined],
		['09/01/2026', '2026-09-30'],
		['2026-02-30', '2026-03-01'],
		['2026-09-30', '2026-09-01'],
	] as const) {
		assert.equal(parseReportRange(from, to).ok, false, `${from}..${to}`);
	}
});

test(`rejects a range longer than ${MAX_REPORT_DAYS} days`, () => {
	const from = '2025-01-01';
	assert.equal(parseReportRange(from, addDays(from, MAX_REPORT_DAYS - 1)).ok, true);
	assert.equal(parseReportRange(from, addDays(from, MAX_REPORT_DAYS)).ok, false);
});

test('local midnight in Chicago maps to 05:00Z in summer and 06:00Z in winter', () => {
	assert.equal(
		localDayStartUtc('2026-07-15', 'America/Chicago').toISOString(),
		'2026-07-15T05:00:00.000Z'
	);
	assert.equal(
		localDayStartUtc('2026-01-15', 'America/Chicago').toISOString(),
		'2026-01-15T06:00:00.000Z'
	);
});

test('the window spans DST changes without losing or gaining an hour at the edges', () => {
	// US DST ends 2026-11-01; that local day is 25 hours long.
	const {start, endExclusive} = reportWindowUtc(
		{from: '2026-11-01', to: '2026-11-01'},
		'America/Chicago'
	);
	assert.equal(start.toISOString(), '2026-11-01T05:00:00.000Z');
	assert.equal(endExclusive.toISOString(), '2026-11-02T06:00:00.000Z');
});

test('a late-evening local log falls inside its local day, not the next UTC day', () => {
	const {start, endExclusive} = reportWindowUtc(
		{from: '2026-09-30', to: '2026-09-30'},
		'America/Chicago'
	);
	// 11:30 PM CDT on Sept 30 is 04:30Z on Oct 1.
	const lateLog = new Date('2026-10-01T04:30:00.000Z');
	assert.ok(lateLog >= start && lateLog < endExclusive);
});
