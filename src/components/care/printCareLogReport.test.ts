import assert from 'node:assert/strict';
import test from 'node:test';

import type {CareLogReport, CareLogReportEntry} from '@/lib/care-log-report';
import {buildCareLogReportHtml, groupCareLogEntries} from './printCareLogReport';

function entry(overrides: Partial<CareLogReportEntry> = {}): CareLogReportEntry {
	return {
		id: 'log-1',
		residentId: 'res-1',
		residentName: 'Ada Lovelace',
		loggedAt: '2026-09-15T14:05:00.000Z',
		loggedDate: '2026-09-15',
		authorName: 'Jane Staff',
		logType: 'daily_notes',
		template: null,
		content: 'Ate breakfast, went for a walk.',
		activities: [],
		...overrides,
	};
}

function report(entries: CareLogReportEntry[]): CareLogReport {
	return {
		location: 'Maple House',
		from: '2026-09-01',
		to: '2026-09-30',
		timeZone: 'America/Chicago',
		generatedAt: '2026-09-30T20:00:00.000Z',
		entries,
	};
}

test('states location, period, and total entry count in the header and footer', () => {
	const html = buildCareLogReportHtml(
		report([entry(), entry({id: 'log-2', residentName: 'Grace Hopper'})])
	);
	assert.match(html, /Maple House/);
	assert.match(html, /September 1, 2026 – September 30, 2026/);
	assert.match(html, /Total entries: <span>2<\/span>/);
	assert.match(html, /End of report &middot; 2 entries/);
	assert.match(html, /Times shown in America\/Chicago/);
});

test('prints the El Elyon emblem and name, never the placeholder logo', () => {
	const html = buildCareLogReportHtml(report([entry()]));
	assert.match(html, /<img src="\/el-elyon-emblem\.svg"/);
	assert.match(html, /<span>EL ELYON PROPERTIES LLC<\/span>/);
	assert.doesNotMatch(html, /logo\.svg/);
});

test('renders times in the report timezone, not UTC', () => {
	const html = buildCareLogReportHtml(report([entry()]));
	// 14:05Z is 9:05 AM CDT.
	assert.match(html, /Sep 15, 2026, 9:05 AM/);
});

test('every entry is printed, whatever the grouping', () => {
	const entries = [
		entry({id: 'a', residentName: 'Resident A', content: 'note-a', loggedDate: '2026-09-01'}),
		entry({id: 'b', residentName: 'Resident B', content: 'note-b', loggedDate: '2026-09-01'}),
		entry({id: 'c', residentName: 'Resident A', content: 'note-c', loggedDate: '2026-09-02'}),
	];
	const sections = groupCareLogEntries(entries);
	assert.equal(
		sections.reduce((sum, section) => sum + section.entries.length, 0),
		entries.length
	);
	const html = buildCareLogReportHtml(report(entries));
	for (const note of ['note-a', 'note-b', 'note-c']) assert.match(html, new RegExp(note));
});

test('groups by resident alphabetically, keeping each resident in time order', () => {
	const sections = groupCareLogEntries([
		entry({id: '1', residentId: 'z', residentName: 'Zoe', loggedAt: '2026-09-01T10:00:00.000Z'}),
		entry({id: '2', residentId: 'a', residentName: 'Abe', loggedAt: '2026-09-02T10:00:00.000Z'}),
		entry({id: '3', residentId: 'z', residentName: 'Zoe', loggedAt: '2026-09-03T10:00:00.000Z'}),
		entry({id: '4', residentId: 'a', residentName: 'Abe', loggedAt: '2026-09-04T10:00:00.000Z'}),
	]);
	assert.deepEqual(
		sections.map((s) => [s.heading, s.entries.map((e) => e.id)]),
		[
			['Abe', ['2', '4']],
			['Zoe', ['1', '3']],
		]
	);
});

test('two residents who share a name stay in separate sections', () => {
	const sections = groupCareLogEntries([
		entry({id: '1', residentId: 'r1', residentName: 'Sam Lee'}),
		entry({id: '2', residentId: 'r2', residentName: 'Sam Lee'}),
	]);
	assert.equal(sections.length, 2);
});

test('resident sections carry the name and count in the heading, not a column', () => {
	const html = buildCareLogReportHtml(report([entry(), entry({id: 'log-2'})]));
	assert.match(html, /<h2>Ada Lovelace <span class="count">\(2 entries\)<\/span><\/h2>/);
	assert.doesNotMatch(html, /<th class="resident">/);
});

test('prints recorded activities and skips unchecked ones without notes', () => {
	const html = buildCareLogReportHtml(
		report([
			entry({
				activities: [
					{activityType: 'Took medications', completed: true, notes: null},
					{activityType: 'Bath', completed: false, notes: 'Refused'},
					{activityType: 'Laundry', completed: false, notes: null},
				],
			}),
		])
	);
	assert.match(html, /Took medications/);
	assert.match(html, /Bath &mdash; Refused/);
	assert.doesNotMatch(html, /Laundry/);
});

test('escapes log content and names', () => {
	const html = buildCareLogReportHtml(
		report([entry({residentName: '<b>x</b>', content: '<script>alert(1)</script>'})])
	);
	assert.doesNotMatch(html, /<script>alert/);
	assert.doesNotMatch(html, /<b>x<\/b>/);
});

test('an empty period says so explicitly instead of printing an empty table', () => {
	const html = buildCareLogReportHtml(report([]));
	assert.match(html, /No activity logs were recorded/);
	assert.doesNotMatch(html, /<table>/);
	assert.match(html, /End of report &middot; 0 entries/);
});
