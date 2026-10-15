import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildGlucoseLogSheetHtml, type GlucoseSheetEntry} from './printGlucoseLogSheet';
import {DEFAULT_GLUCOSE_THRESHOLDS} from '@/lib/blood-glucose';

const fixedFormat = (iso: string) => ({date: iso.slice(5, 10), time: iso.slice(11, 16)});

const entry = (over: Partial<GlucoseSheetEntry>): GlucoseSheetEntry => ({
	checkedAt: '2026-10-02T07:30:00.000Z',
	checkType: 'before_breakfast',
	method: 'fingerstick',
	refused: false,
	refusalReason: null,
	readingValue: 120,
	readingUnit: 'mg_dl',
	status: 'in_range',
	symptoms: [],
	actionsTaken: [],
	notifiedWho: null,
	insulinGiven: false,
	insulinType: null,
	insulinUnits: null,
	notes: null,
	staffNameSnapshot: 'Grace Obi',
	updatedAt: null,
	reviewedAt: null,
	reviewedByName: null,
	...over,
});

const build = (entries: GlucoseSheetEntry[]) =>
	buildGlucoseLogSheetHtml({
		residentName: 'Joy <Lackey>',
		monthLabel: 'October 2026',
		thresholds: DEFAULT_GLUCOSE_THRESHOLDS,
		entries,
		formatDateTime: fixedFormat,
	});

test('lists checks oldest first with the resident limits in the header', () => {
	const html = build([
		entry({checkedAt: '2026-10-03T21:00:00.000Z', checkType: 'bedtime', readingValue: 150}),
		entry({}),
	]);
	assert.ok(html.indexOf('10-02') < html.indexOf('10-03'));
	assert.match(html, /TARGET: <span>70-180 mg\/dL/);
	assert.match(html, /below 54 \/ above 400/);
	assert.match(html, /Joy &lt;Lackey&gt;/);
});

test('out-of-range rows are shaded and show what was done and who reviewed', () => {
	const html = build([
		entry({
			readingValue: 3.2,
			readingUnit: 'mmol_l',
			status: 'low',
			symptoms: ['shaky'],
			actionsTaken: ['juice_or_glucose', 'nurse_notified'],
			notifiedWho: 'Nurse Ada',
			insulinGiven: false,
			reviewedAt: '2026-10-02T09:00:00.000Z',
			reviewedByName: 'Sup Bola',
		}),
	]);
	assert.match(html, /<tr class="flag">/);
	assert.match(html, /3\.2 mmol\/L/);
	assert.match(html, /Symptoms: Shaky/);
	assert.match(html, /Done: Gave juice or glucose tabs, Nurse notified/);
	assert.match(html, /Notified: Nurse Ada/);
	assert.match(html, /Sup Bola/);
});

test('refused checks and insulin doses are shown', () => {
	const html = build([
		entry({refused: true, readingValue: null, status: 'refused', refusalReason: 'Asleep'}),
		entry({insulinGiven: true, insulinType: 'Lispro', insulinUnits: 4.5}),
	]);
	assert.match(html, /Refused/);
	assert.match(html, /Not done: Asleep/);
	assert.match(html, /4\.5 u Lispro/);
});

test('an empty month still prints a sheet', () => {
	assert.match(build([]), /No checks logged this month/);
});
