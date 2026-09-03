import assert from 'node:assert/strict';
import test from 'node:test';
import {
	projectInspectorWaterTemperatureMonth,
	type InspectorWaterTemperatureMonth,
} from '@/lib/inspector-water-temperature-projection';
import {
	buildWaterTemperatureCheckLogHtml,
	type PrintableWaterTemperatureMonth,
} from '@/components/supervisor/printWaterTemperatureReport';
import {
	INSPECTOR_WATER_TEMPERATURE_MARKERS,
	buildInspectorWaterTemperatureMonthView,
	describeInspectorWaterTemperatureCell,
	formatInspectorTemperature,
	inspectorLocalToday,
	inspectorMonthLabel,
	inspectorWaterTemperatureQuery,
	isInspectorWaterTemperatureReady,
	isValidInspectorMonthSelection,
	toPrintableInspectorWaterTemperatureMonth,
} from './waterTemperaturePresentation';

// ============================================================================
// FIXTURES
// ============================================================================

const LOCATION_ID = '11111111-1111-4111-8111-111111111111';
const CHECK_ONE = '22222222-2222-4222-8222-222222222222';
const CHECK_TWO = '33333333-3333-4333-8333-333333333333';
const CLERK_ID = 'user_2clerkSECRET';
const STAFF_NAME = 'Morgan Steele';

/** One shared set of database rows, projected two ways below. */
const RAW_CHECKS = [
	{
		id: CHECK_ONE,
		locationId: LOCATION_ID,
		houseNameSnapshot: 'House A',
		shiftId: '55555555-5555-4555-8555-555555555555',
		operationalDate: '2026-03-04',
		shiftSlot: 2,
		kitchenTempTenths: 1250,
		bathTempTenths: 1130,
		staffId: CLERK_ID,
		staffNameSnapshot: STAFF_NAME,
		staffInitialsSnapshot: 'MS',
		observedAt: new Date('2026-03-04T14:05:00.000Z'),
		comments: 'Kitchen tap ran hot at shift start.',
		action: 'Adjusted the mixing valve and notified the coordinator.',
		state: 'complete',
		version: 9,
		voidedAt: null,
	},
	{
		id: CHECK_TWO,
		locationId: LOCATION_ID,
		houseNameSnapshot: 'House A',
		shiftId: null,
		operationalDate: '2026-03-05',
		shiftSlot: 1,
		kitchenTempTenths: 1080,
		bathTempTenths: 1120,
		staffId: CLERK_ID,
		staffNameSnapshot: STAFF_NAME,
		staffInitialsSnapshot: 'RB',
		observedAt: new Date('2026-03-05T07:10:00.000Z'),
		comments: null,
		action: null,
		state: 'complete_with_attention',
		version: 1,
		voidedAt: null,
	},
];

const RAW_RECHECKS = [
	{
		id: 'recheck-1',
		checkId: CHECK_ONE,
		fixture: 'kitchen',
		tempTenths: 1160,
		staffId: CLERK_ID,
		staffNameSnapshot: STAFF_NAME,
		staffInitialsSnapshot: 'MS',
		measuredAt: new Date('2026-03-04T15:30:00.000Z'),
		sequence: 1,
		supersededAt: new Date('2026-03-04T16:00:00.000Z'),
		supersededReason: 'Mistyped by supervisor',
		voidedAt: null,
	},
	{
		id: 'recheck-2',
		checkId: CHECK_ONE,
		fixture: 'kitchen',
		tempTenths: 1140,
		staffId: CLERK_ID,
		staffNameSnapshot: STAFF_NAME,
		staffInitialsSnapshot: 'RB',
		measuredAt: new Date('2026-03-04T16:30:00.000Z'),
		sequence: 2,
		supersededAt: null,
		voidedAt: null,
	},
];

function inspectorMonth(year = 2026, month = 3): InspectorWaterTemperatureMonth {
	return projectInspectorWaterTemperatureMonth({
		location: {id: LOCATION_ID, name: 'House A'},
		year,
		month,
		checks: year === 2026 && month === 3 ? RAW_CHECKS : [],
		rechecks: year === 2026 && month === 3 ? RAW_RECHECKS : [],
	});
}

/**
 * Mirrors `WaterTemperatureWorkspace.printReport`'s DTO -> printable mapping
 * exactly (src/components/supervisor/WaterTemperatureWorkspace.tsx). If that
 * mapping changes, this assertion is where the two surfaces are proven to
 * still print the same sheet.
 */
function supervisorPrintable(): PrintableWaterTemperatureMonth {
	const dtos = RAW_CHECKS.map((row) => ({
		operationalDate: row.operationalDate,
		shiftSlot: row.shiftSlot as 1 | 2 | 3,
		kitchenTempF: row.kitchenTempTenths / 10,
		bathTempF: row.bathTempTenths / 10,
		staffInitials: row.staffInitialsSnapshot,
		comments: row.comments,
		action: row.action,
		state: row.state as 'complete' | 'complete_with_attention',
		rechecks: RAW_RECHECKS.filter((recheck) => recheck.checkId === row.id).map((recheck) => ({
			fixture: recheck.fixture as 'kitchen' | 'bath_shower',
			tempF: recheck.tempTenths / 10,
			staffInitials: recheck.staffInitialsSnapshot,
			sequence: recheck.sequence,
			supersededAt: recheck.supersededAt ? recheck.supersededAt.toISOString() : null,
			voidedAt: recheck.voidedAt ? (recheck.voidedAt as Date).toISOString() : null,
		})),
	}));
	return {houseName: 'House A', year: 2026, month: 3, checks: dtos};
}

// ============================================================================
// CALENDAR PROJECTION
// ============================================================================

test('the inspector grid always has 31 rows and marks nonexistent dates N/A', () => {
	const march = buildInspectorWaterTemperatureMonthView({
		data: inspectorMonth(2026, 3),
		todayLocalDate: '2026-03-31',
	});
	assert.equal(march.rows.length, 31);
	assert.equal(march.summary.validDays, 31);
	assert.equal(march.summary.naDays, 0);
	assert.equal(march.monthLabel, 'March 2026');

	const leap = buildInspectorWaterTemperatureMonthView({
		data: inspectorMonth(2028, 2),
		todayLocalDate: '2028-03-01',
	});
	assert.equal(leap.rows.length, 31);
	assert.equal(leap.summary.validDays, 29);
	assert.equal(leap.summary.naDays, 2);
	assert.deepEqual(
		leap.rows.filter((row) => !row.existsInMonth).map((row) => row.day),
		[30, 31]
	);
	assert.equal(leap.summary.naCells, 6);

	const common = buildInspectorWaterTemperatureMonthView({
		data: inspectorMonth(2027, 2),
		todayLocalDate: '2027-03-01',
	});
	assert.deepEqual(
		common.rows.filter((row) => !row.existsInMonth).map((row) => row.day),
		[29, 30, 31]
	);
	for (const row of common.rows.filter((entry) => !entry.existsInMonth)) {
		for (const cell of row.cells) {
			assert.equal(cell.status, 'na');
			assert.equal(cell.marker.symbol, 'N/A');
			assert.equal(cell.date, null);
		}
	}
});

test('missing, future, and recorded cells are explicit and separately counted', () => {
	const view = buildInspectorWaterTemperatureMonthView({
		data: inspectorMonth(),
		todayLocalDate: '2026-03-10',
	});

	const recorded = view.rows[3].cells[1];
	assert.equal(recorded.date, '2026-03-04');
	assert.equal(recorded.status, 'complete');
	assert.equal(recorded.kitchenTempF, 125);
	assert.equal(recorded.bathTempF, 113);
	assert.equal(recorded.initials, 'MS');
	assert.equal(recorded.aboveRange, true);
	assert.equal(recorded.rechecks.length, 2);

	const belowRange = view.rows[4].cells[0];
	assert.equal(belowRange.status, 'complete_with_attention');
	assert.equal(belowRange.belowRange, true);

	// An elapsed valid day with no record is Missing, not blank-and-ambiguous.
	assert.equal(view.rows[0].cells[0].status, 'missing');
	// A day that has not arrived yet is never delinquent.
	assert.equal(view.rows[20].cells[0].status, 'future');
	assert.equal(view.rows[20].isFuture, true);

	assert.equal(view.summary.obligationCount, 93);
	assert.equal(view.summary.complete, 1);
	assert.equal(view.summary.completeWithAttention, 1);
	assert.equal(view.summary.missing, 28);
	assert.equal(view.summary.future, 63);
	assert.equal(view.summary.pending, 0);
	assert.equal(
		view.summary.complete +
			view.summary.completeWithAttention +
			view.summary.missing +
			view.summary.future +
			view.summary.actionRequired +
			view.summary.recheckRequired,
		view.summary.obligationCount
	);
});

test('pending above-115 states are surfaced as pending, not complete', () => {
	const data = projectInspectorWaterTemperatureMonth({
		location: {id: LOCATION_ID, name: 'House A'},
		year: 2026,
		month: 3,
		checks: [
			{...RAW_CHECKS[0], state: 'action_required'},
			{...RAW_CHECKS[1], state: 'recheck_required'},
		],
		rechecks: [],
	});
	const view = buildInspectorWaterTemperatureMonthView({data, todayLocalDate: '2026-03-31'});
	assert.equal(view.summary.actionRequired, 1);
	assert.equal(view.summary.recheckRequired, 1);
	assert.equal(view.summary.pending, 2);
	assert.equal(view.rows[3].cells[1].marker.label, 'Pending — action required');
	assert.equal(view.rows[4].cells[0].marker.label, 'Pending — recheck required');
});

test('every status is distinguishable without colour', () => {
	const markers = Object.values(INSPECTOR_WATER_TEMPERATURE_MARKERS);
	const symbols = new Set(markers.map((marker) => marker.symbol));
	const labels = new Set(markers.map((marker) => marker.label));
	assert.equal(symbols.size, markers.length);
	assert.equal(labels.size, markers.length);
	for (const marker of markers) {
		assert.equal(marker.symbol.trim().length > 0, true);
		assert.equal(marker.label.trim().length > 0, true);
	}
});

test('cell descriptions name the state, readings, and initials for assistive technology', () => {
	const view = buildInspectorWaterTemperatureMonthView({
		data: inspectorMonth(),
		todayLocalDate: '2026-03-10',
	});
	const recorded = view.rows[3].cells[1];
	assert.equal(
		recorded.description,
		'2026-03-04, 2nd Shift: Complete, kitchen 125.0°F, bath / shower 113.0°F, initials MS, 2 rechecks recorded'
	);
	assert.equal(
		describeInspectorWaterTemperatureCell(view.rows[0].cells[0]),
		'2026-03-01, 1st Shift: missing — no water temperature recorded'
	);
	assert.equal(
		describeInspectorWaterTemperatureCell(view.rows[20].cells[2]),
		'2026-03-21, 3rd Shift: not yet due'
	);
	assert.equal(
		describeInspectorWaterTemperatureCell(
			buildInspectorWaterTemperatureMonthView({
				data: inspectorMonth(2027, 2),
				todayLocalDate: '2027-03-01',
			}).rows[30].cells[0]
		),
		'1st Shift: not a valid date in this month'
	);
});

// ============================================================================
// NO AUTHORING SURFACE
// ============================================================================

test('the inspector cell exposes no authoring, correction, void, or version affordance', () => {
	const view = buildInspectorWaterTemperatureMonthView({
		data: inspectorMonth(),
		todayLocalDate: '2026-03-31',
	});
	for (const cell of view.rows.flatMap((row) => row.cells)) {
		for (const key of Object.keys(cell)) {
			assert.equal(
				/^can[A-Z]/.test(key) ||
					key === 'version' ||
					key === 'expectedVersion' ||
					key === 'voidedHistory',
				false,
				`inspector cell must not expose "${key}"`
			);
		}
	}
	const serialized = JSON.stringify(view);
	assert.equal(serialized.includes(STAFF_NAME), false);
	assert.equal(serialized.includes(CLERK_ID), false);
	assert.equal(serialized.includes(CHECK_ONE), false);
	assert.equal(serialized.includes(LOCATION_ID), false);
});

// ============================================================================
// SHARED PRINT OUTPUT
// ============================================================================

test('inspector and supervisor print byte-identical sheets for the same house and month', () => {
	const fromInspector = buildWaterTemperatureCheckLogHtml(
		toPrintableInspectorWaterTemperatureMonth(inspectorMonth())
	);
	const fromSupervisor = buildWaterTemperatureCheckLogHtml(supervisorPrintable());
	assert.equal(fromInspector, fromSupervisor);

	// The same active facts are actually on the sheet, not merely equal-and-empty.
	assert.equal(fromInspector.includes('125.0'), true);
	assert.equal(fromInspector.includes('113.0'), true);
	assert.equal(fromInspector.includes('Recheck Kitchen 116.0 (MS, superseded)'), true);
	assert.equal(fromInspector.includes('Recheck Kitchen 114.0 (RB)'), true);
	assert.equal(fromInspector.includes('House A'), true);
	assert.equal(fromInspector.includes('March 2026'), true);
	// And no privileged identity reached the paper.
	assert.equal(fromInspector.includes(STAFF_NAME), false);
	assert.equal(fromInspector.includes(CLERK_ID), false);
	assert.equal(fromInspector.includes('Mistyped by supervisor'), false);
});

test('the printable mapping keeps the original unsafe reading and the ordered recheck chain', () => {
	const printable = toPrintableInspectorWaterTemperatureMonth(inspectorMonth());
	const check = printable.checks.find((entry) => entry.operationalDate === '2026-03-04');
	assert.ok(check);
	assert.equal(check.kitchenTempF, 125);
	assert.deepEqual(
		(check.rechecks ?? []).map((recheck) => [recheck.sequence, recheck.tempF, recheck.supersededAt]),
		[
			[1, 116, 'superseded'],
			[2, 114, null],
		]
	);
});

// ============================================================================
// SELECTORS AND SCOPE READINESS
// ============================================================================

test('only month and year are sent to the endpoint', () => {
	const query = inspectorWaterTemperatureQuery({year: 2026, month: 3});
	assert.equal(query, 'year=2026&month=3');
	assert.equal(query.includes('location'), false);
	assert.equal(query.includes('house'), false);
});

test('month selection validation refuses out-of-range values', () => {
	assert.equal(isValidInspectorMonthSelection(2026, 3), true);
	assert.equal(isValidInspectorMonthSelection(2019, 3), false);
	assert.equal(isValidInspectorMonthSelection(2026, 13), false);
	assert.equal(isValidInspectorMonthSelection(Number.NaN, 3), false);
});

test('a response for a previous month is never treated as the current one', () => {
	assert.equal(
		isInspectorWaterTemperatureReady({
			currentScope: {year: 2026, month: 3},
			loadedScope: {year: 2026, month: 2},
			state: 'ready',
		}),
		false
	);
	assert.equal(
		isInspectorWaterTemperatureReady({
			currentScope: {year: 2026, month: 3},
			loadedScope: {year: 2026, month: 3},
			state: 'loading',
		}),
		false
	);
	assert.equal(
		isInspectorWaterTemperatureReady({
			currentScope: {year: 2026, month: 3},
			loadedScope: {year: 2026, month: 3},
			state: 'ready',
		}),
		true
	);
});

test('formatting helpers render temperatures, labels, and today deterministically', () => {
	assert.equal(formatInspectorTemperature(112), '112.0°F');
	assert.equal(formatInspectorTemperature(null), '—');
	assert.equal(formatInspectorTemperature(Number.NaN), '—');
	assert.equal(inspectorMonthLabel(2026, 2), 'February 2026');
	assert.equal(inspectorLocalToday(new Date(2026, 2, 4)), '2026-03-04');
	assert.equal(inspectorLocalToday(new Date(2026, 11, 31)), '2026-12-31');
});
