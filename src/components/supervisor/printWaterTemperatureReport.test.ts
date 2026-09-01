// Tests for the pure DAILY WATER TEMPERATURE CHECK LOG print builder (U5).
//
// Browser/Chromium print preview is not available in this environment, so the
// one-page guarantee is asserted structurally instead: a fixed Letter
// landscape page box, exactly 31 body rows, 11 logical columns, bounded
// comment text, and clipped overflow.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
	ABOVE_115_ESCALATION_INSTRUCTIONS,
	WATER_TEMPERATURE_COMMENTS_HEADER,
	WATER_TEMPERATURE_DATE_HEADER,
	WATER_TEMPERATURE_LOGICAL_COLUMNS,
	WATER_TEMPERATURE_MONTH_FIELD_LABEL,
	WATER_TEMPERATURE_REPORT_TITLE,
	WATER_TEMPERATURE_SAFE_RANGE_LEAD,
	WATER_TEMPERATURE_SAFE_RANGE_VALUE,
	WATER_TEMPERATURE_SHIFT_GROUP_HEADERS,
	WATER_TEMPERATURE_SHIFT_INSTRUCTION,
	WATER_TEMPERATURE_SHIFT_SUB_HEADERS,
	buildCommentsCellText,
	buildSlotComment,
	buildWaterTemperatureCheckLogHtml,
	ordinalDayLabel,
	type PrintableWaterTemperatureCheck,
	type PrintableWaterTemperatureMonth,
} from './printWaterTemperatureReport';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function bodyRows(html: string): string[] {
	const match = /<tbody>([\s\S]*?)<\/tbody>/.exec(html);
	assert.ok(match, 'report must contain a table body');
	return match[1]!
		.split('</tr>')
		.filter((fragment) => fragment.includes('<tr'))
		.map((fragment) => `${fragment}</tr>`);
}

function cellCount(row: string): number {
	return (row.match(/<t[hd][\s>]/g) ?? []).length;
}

function check(
	overrides: Partial<PrintableWaterTemperatureCheck> & {
		operationalDate: string;
		shiftSlot: 1 | 2 | 3;
	}
): PrintableWaterTemperatureCheck {
	return {
		kitchenTempF: 112,
		bathTempF: 114,
		staffInitials: 'MS',
		comments: null,
		action: null,
		state: 'complete',
		rechecks: [],
		...overrides,
	};
}

function report(
	overrides: Partial<PrintableWaterTemperatureMonth> = {}
): PrintableWaterTemperatureMonth {
	return {houseName: 'Cedar House', year: 2026, month: 1, checks: [], ...overrides};
}

// ---------------------------------------------------------------------------
// form copy + structure
// ---------------------------------------------------------------------------

test('the sheet reproduces the source form copy exactly', () => {
	const html = buildWaterTemperatureCheckLogHtml(report());

	assert.match(html, /size: Letter landscape/);
	assert.match(html, new RegExp(escapeRegExp(WATER_TEMPERATURE_REPORT_TITLE)));
	assert.match(html, new RegExp(escapeRegExp(WATER_TEMPERATURE_SAFE_RANGE_LEAD)));
	assert.match(html, new RegExp(escapeRegExp(WATER_TEMPERATURE_SAFE_RANGE_VALUE)));
	assert.match(html, new RegExp(escapeRegExp(WATER_TEMPERATURE_SHIFT_INSTRUCTION)));
	assert.match(html, new RegExp(escapeRegExp(WATER_TEMPERATURE_MONTH_FIELD_LABEL)));
	assert.match(html, />January 2026</);
	assert.match(html, />Cedar House</);

	// The safe range is coloured on the paper form, but the range is also its
	// own labelled span so the guidance is never colour-only.
	assert.match(html, /<span class="range">110°F - 115°F<\/span>/);
});

test('all 11 logical columns appear in the two grouped header rows', () => {
	const html = buildWaterTemperatureCheckLogHtml(report());

	assert.equal(WATER_TEMPERATURE_LOGICAL_COLUMNS.length, 11);
	assert.match(html, new RegExp(`>${escapeRegExp(WATER_TEMPERATURE_DATE_HEADER)}<`));
	assert.match(html, new RegExp(`>${escapeRegExp(WATER_TEMPERATURE_COMMENTS_HEADER)}<`));
	for (const group of WATER_TEMPERATURE_SHIFT_GROUP_HEADERS) {
		assert.equal((html.match(new RegExp(`>${escapeRegExp(group)}<`, 'g')) ?? []).length, 1);
	}
	for (const sub of WATER_TEMPERATURE_SHIFT_SUB_HEADERS) {
		assert.equal((html.match(new RegExp(`>${escapeRegExp(sub)}<`, 'g')) ?? []).length, 3);
	}
	// Three colspan-3 shift groups plus a rowspan DATE and COMMENTS column.
	assert.equal((html.match(/colspan="3"/g) ?? []).length, 3);
	assert.equal((html.match(/rowspan="2"/g) ?? []).length, 2);
});

test('the above-115 escalation footer is reused verbatim from the shared constant', () => {
	const html = buildWaterTemperatureCheckLogHtml(report());
	const [lead, ...rest] = ABOVE_115_ESCALATION_INSTRUCTIONS.split(':');
	const tail = rest.join(':').trimStart();

	assert.match(html, new RegExp(`<strong>${escapeRegExp(`${lead}:`)}</strong>`));
	assert.match(html, new RegExp(escapeRegExp(tail.slice(0, 60))));
	assert.match(html, /Never rely on touch\./);
});

test('January renders 31 valid ordinal rows of 11 cells each', () => {
	const rows = bodyRows(buildWaterTemperatureCheckLogHtml(report({year: 2026, month: 1})));

	assert.equal(rows.length, 31);
	rows.forEach((row, index) => {
		assert.equal(cellCount(row), 11, `row ${index + 1} must have 11 cells`);
		assert.match(row, new RegExp(`>${ordinalDayLabel(index + 1)}<`));
		assert.doesNotMatch(row, /N\/A/);
	});
	assert.equal(ordinalDayLabel(1), '1st');
	assert.equal(ordinalDayLabel(2), '2nd');
	assert.equal(ordinalDayLabel(3), '3rd');
	assert.equal(ordinalDayLabel(11), '11th');
	assert.equal(ordinalDayLabel(21), '21st');
	assert.equal(ordinalDayLabel(31), '31st');
});

test('February 2028 renders 29 valid rows and marks 30 and 31 N/A', () => {
	const rows = bodyRows(buildWaterTemperatureCheckLogHtml(report({year: 2028, month: 2})));

	assert.equal(rows.length, 31);
	for (let index = 0; index < 29; index += 1) {
		assert.doesNotMatch(rows[index]!, /N\/A/, `row ${index + 1} must be a valid day`);
	}
	for (const index of [29, 30]) {
		assert.match(rows[index]!, /class="na-row"/);
		assert.equal((rows[index]!.match(/N\/A/g) ?? []).length, 10);
		assert.equal(cellCount(rows[index]!), 11);
	}
});

test('February 2027 marks rows 29 through 31 N/A', () => {
	const rows = bodyRows(buildWaterTemperatureCheckLogHtml(report({year: 2027, month: 2})));

	assert.equal(rows.filter((row) => row.includes('na-row')).length, 3);
	for (const index of [28, 29, 30]) {
		assert.match(rows[index]!, /class="na-row"/);
	}
	assert.doesNotMatch(rows[27]!, /N\/A/);
});

// ---------------------------------------------------------------------------
// original readings are never replaced
// ---------------------------------------------------------------------------

test('main temperature cells keep the original unsafe reading after a safe recheck', () => {
	const html = buildWaterTemperatureCheckLogHtml(
		report({
			year: 2026,
			month: 1,
			checks: [
				check({
					operationalDate: '2026-01-05',
					shiftSlot: 2,
					kitchenTempF: 118,
					bathTempF: 113,
					action: 'Lowered set point',
					state: 'complete',
					rechecks: [
						{fixture: 'kitchen', tempF: 116, staffInitials: 'AB', sequence: 1},
						{fixture: 'kitchen', tempF: 114, staffInitials: 'CD', sequence: 2},
					],
				}),
			],
		})
	);
	const row = bodyRows(html)[4]!;

	// The grid cell shows 118.0 -- never the later safe 114.0.
	assert.match(row, /<td class="temp shift-2 group-start">118\.0<\/td>/);
	assert.match(row, /<td class="temp shift-2">113\.0<\/td>/);
	assert.doesNotMatch(row, /<td class="temp shift-2 group-start">114\.0<\/td>/);

	const comment = /<td class="comments">([\s\S]*?)<\/td>/.exec(row)![1]!;
	assert.match(comment, /^2nd:/);
	assert.ok(
		comment.indexOf('Kitchen 118.0 above 115') <
			comment.indexOf('Action:'),
		'the unsafe original must precede the documented action'
	);
	assert.ok(
		comment.indexOf('Recheck Kitchen 116.0') < comment.indexOf('Recheck Kitchen 114.0'),
		'rechecks must appear in sequence order'
	);
	assert.match(comment, /\(AB\)/);
	assert.match(comment, /\(CD\)/);
});

test('slot comments are composed deterministically and expose initials, not names', () => {
	const composed = buildSlotComment(
		check({
			operationalDate: '2026-01-01',
			shiftSlot: 1,
			kitchenTempF: 118,
			bathTempF: 108,
			comments: 'Reported by\nmaintenance',
			action: 'Adjusted mixing valve',
			state: 'recheck_required',
			rechecks: [{fixture: 'kitchen', tempF: 117, staffInitials: 'AB', sequence: 1}],
		})
	);

	assert.match(composed, /^Kitchen 118\.0 above 115°F; Bath\/Shower 108\.0 below 110°F/);
	assert.match(composed, /Reported by maintenance/);
	assert.match(composed, /Action: Adjusted mixing valve/);
	assert.match(composed, /Recheck Kitchen 117\.0 \(AB\)/);
	assert.match(composed, /Pending: safe recheck$/);
	assert.equal(buildSlotComment(undefined), '');
});

test('the comments cell shares one bounded budget across the shifts that use it', () => {
	const single = buildCommentsCellText([{slot: 1, text: 'x'.repeat(500)}]);
	assert.ok(single.length <= 290);
	assert.match(single, /^1st: x+…$/);

	const three = buildCommentsCellText([
		{slot: 1, text: 'a'.repeat(500)},
		{slot: 2, text: 'b'.repeat(500)},
		{slot: 3, text: 'c'.repeat(500)},
	]);
	assert.ok(three.length <= 290, `cell text too long: ${three.length}`);
	assert.match(three, /^1st: a+…\s\|\s2nd: b+…\s\|\s3rd: c/);

	// A short narrative is never padded, reordered, or truncated.
	assert.equal(
		buildCommentsCellText([
			{slot: 1, text: 'Kitchen 118.0 above 115°F; Action: Reset mixer'},
			{slot: 3, text: 'All in range'},
		]),
		'1st: Kitchen 118.0 above 115°F; Action: Reset mixer | 3rd: All in range'
	);
	assert.equal(buildCommentsCellText([]), '');
});

test('superseded rechecks stay visible and are labelled', () => {
	const composed = buildSlotComment(
		check({
			operationalDate: '2026-01-01',
			shiftSlot: 3,
			kitchenTempF: 117,
			bathTempF: 112,
			action: 'Flushed line',
			state: 'complete',
			rechecks: [
				{
					fixture: 'kitchen',
					tempF: 91,
					staffInitials: 'AB',
					sequence: 1,
					supersededAt: '2026-01-02T00:00:00.000Z',
				},
				{fixture: 'kitchen', tempF: 113, staffInitials: 'AB', sequence: 2},
			],
		})
	);

	assert.match(composed, /Recheck Kitchen 91\.0 \(AB, superseded\)/);
	assert.match(composed, /Recheck Kitchen 113\.0 \(AB\)/);
});

test('pending states are stated in words, not implied by an empty cell', () => {
	assert.match(
		buildSlotComment(
			check({operationalDate: '2026-01-01', shiftSlot: 1, kitchenTempF: 119, state: 'action_required'})
		),
		/Pending: corrective action/
	);
	assert.match(
		buildSlotComment(
			check({
				operationalDate: '2026-01-01',
				shiftSlot: 1,
				kitchenTempF: 119,
				action: 'Called maintenance',
				state: 'recheck_required',
			})
		),
		/Pending: safe recheck/
	);
});

// ---------------------------------------------------------------------------
// one page + escaping
// ---------------------------------------------------------------------------

test('a worst-case month of long notes and rechecks stays on one bounded page', () => {
	const long = 'Extremely detailed maintenance narrative. '.repeat(45); // 1 890 chars
	const checks: PrintableWaterTemperatureCheck[] = [];
	for (let day = 1; day <= 31; day += 1) {
		for (const slot of [1, 2, 3] as const) {
			checks.push(
				check({
					operationalDate: `2026-01-${String(day).padStart(2, '0')}`,
					shiftSlot: slot,
					kitchenTempF: 118,
					bathTempF: 117,
					comments: long,
					action: long,
					state: 'recheck_required',
					rechecks: Array.from({length: 10}, (_value, index) => ({
						fixture: 'kitchen' as const,
						tempF: 116,
						staffInitials: 'AB',
						sequence: index + 1,
					})),
				})
			);
		}
	}

	const html = buildWaterTemperatureCheckLogHtml(report({checks}));

	assert.equal((html.match(/class="log-page"/g) ?? []).length, 1);
	assert.equal(bodyRows(html).length, 31);
	assert.match(html, /\.log-page \{ width: 11in; height: 8\.5in;[^}]*overflow: hidden/);
	assert.match(html, /td\.comments \{[^}]*overflow: hidden/);
	assert.match(html, /tbody tr \{[^}]*break-inside: avoid/);
	// Each shift's narrative is bounded and so is the combined cell, so three
	// busy shifts can never outgrow the fixed-height comments cell.
	const cells = html.match(/<td class="comments">([\s\S]*?)<\/td>/g) ?? [];
	assert.equal(cells.length, 31);
	for (const cell of cells) {
		const text = decodeEntities(cell.replace(/<[^>]+>/g, ''));
		assert.ok(text.length <= 291, `comment cell too long: ${text.length}`);
		assert.ok(text.endsWith('…'), 'an over-long cell must be visibly truncated');
	}
});

test('group tints survive printing and are backed by text, not colour alone', () => {
	const html = buildWaterTemperatureCheckLogHtml(report());
	assert.match(html, /-webkit-print-color-adjust: exact/);
	assert.match(html, /print-color-adjust: exact/);
	assert.match(html, /\.log-table thead \.shift-1 \{ background: #d9ead3; \}/);
	assert.match(html, /\.log-table thead \.shift-2 \{ background: #fff2cc; \}/);
	assert.match(html, /\.log-table thead \.shift-3 \{ background: #f9cb9c; \}/);
});

test('every record value stays in an escaped text slot and cannot inject markup', () => {
	const attack =
		`</td></tr><script>alert(1)</script><img src="javascript:alert(2)" onerror="alert(3)">` +
		`</style><style>body{display:none}</style>& " ' <a href='javascript:void(0)'>`;

	const baselineElements = countElements(buildWaterTemperatureCheckLogHtml(report()));
	const html = buildWaterTemperatureCheckLogHtml(
		report({
			houseName: attack,
			checks: [
				check({
					operationalDate: '2026-01-02',
					shiftSlot: 1,
					staffInitials: attack.slice(0, 40),
					comments: attack,
					action: attack,
					kitchenTempF: 118,
					state: 'recheck_required',
					rechecks: [{fixture: 'kitchen', tempF: 116, staffInitials: attack.slice(0, 20), sequence: 1}],
				}),
			],
		})
	);

	assert.doesNotMatch(html, /<script/);
	assert.doesNotMatch(html, / onerror="/);
	assert.doesNotMatch(html, /href='javascript:/);
	assert.doesNotMatch(html, /src="javascript:/);
	// Exactly the markup this module authored: one logo image, one style
	// block, one strong element in the footer -- no injected element,
	// attribute, or style rule survived.
	assert.equal((html.match(/<img /g) ?? []).length, 1);
	assert.equal((html.match(/<style>/g) ?? []).length, 1);
	assert.equal((html.match(/<\/style>/g) ?? []).length, 1);
	// MONTH:, HOUSE:, and the escalation footer's lead-in.
	assert.equal((html.match(/<strong>/g) ?? []).length, 3);
	assert.deepEqual(countElements(html), baselineElements);
	assert.match(html, /&lt;script&gt;/);
	assert.doesNotMatch(html, />null<|>undefined</);
});

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

test('the builder refuses malformed or out-of-month input', () => {
	assert.throws(
		() =>
			buildWaterTemperatureCheckLogHtml(
				report({checks: [check({operationalDate: '2026-02-03', shiftSlot: 1})]})
			),
		/inside the reported month/
	);
	assert.throws(
		() =>
			buildWaterTemperatureCheckLogHtml(
				report({year: 2027, month: 2, checks: [check({operationalDate: '2027-02-29', shiftSlot: 1})]})
			),
		/inside the reported month/
	);
	assert.throws(
		() =>
			buildWaterTemperatureCheckLogHtml(
				report({
					checks: [
						check({operationalDate: '2026-01-04', shiftSlot: 1}),
						check({operationalDate: '2026-01-04', shiftSlot: 1}),
					],
				})
			),
		/Duplicate water temperature record/
	);
	assert.throws(
		() =>
			buildWaterTemperatureCheckLogHtml(
				report({checks: [check({operationalDate: '2026-01-04', shiftSlot: 1, kitchenTempF: 900})]})
			),
		/between 0 and 250/
	);
	assert.throws(() => buildWaterTemperatureCheckLogHtml(report({month: 13})), /month must be/);
	assert.throws(() => buildWaterTemperatureCheckLogHtml(report({houseName: '  '})), /House name/);
});

// ---------------------------------------------------------------------------

function countElements(html: string): Record<string, number> {
	const counts: Record<string, number> = {};
	for (const match of html.match(/<([a-zA-Z][a-zA-Z0-9]*)[\s>/]/g) ?? []) {
		const tag = match.slice(1).replace(/[\s>/]$/, '').toLowerCase();
		counts[tag] = (counts[tag] ?? 0) + 1;
	}
	return counts;
}

function decodeEntities(value: string): string {
	return value
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, '&');
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
