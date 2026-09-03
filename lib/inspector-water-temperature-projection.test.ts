import assert from 'node:assert/strict';
import test from 'node:test';
import {
	INSPECTOR_WATER_TEMPERATURE_FORBIDDEN_KEYS,
	inspectorWaterTemperatureMonthBounds,
	isValidInspectorReportMonth,
	isValidInspectorReportYear,
	projectInspectorWaterTemperatureMonth,
	type RawInspectorWaterTemperatureCheck,
	type RawInspectorWaterTemperatureRecheck,
} from './inspector-water-temperature-projection';

// ============================================================================
// SECRET-BEARING FIXTURES
//
// The raw rows below deliberately carry every field an inspector must never
// see, so the assertions prove the allowlist -- not the fixture -- is what
// keeps them out.
// ============================================================================

const LOCATION_ID = '11111111-1111-4111-8111-111111111111';
const CHECK_ID = '22222222-2222-4222-8222-222222222222';
const VOIDED_CHECK_ID = '33333333-3333-4333-8333-333333333333';
const RECHECK_ID = '44444444-4444-4444-8444-444444444444';
const SHIFT_ID = '55555555-5555-4555-8555-555555555555';
const CLERK_ID = 'user_2clerkSECRET';
const STAFF_NAME = 'Morgan Steele';

const SENSITIVE_VALUES = [
	LOCATION_ID,
	CHECK_ID,
	VOIDED_CHECK_ID,
	RECHECK_ID,
	SHIFT_ID,
	CLERK_ID,
	STAFF_NAME,
	'Reason: mistyped by supervisor',
	'America/Chicago',
	'idem-key-9',
];

function rawCheck(
	overrides: Partial<RawInspectorWaterTemperatureCheck> = {}
): RawInspectorWaterTemperatureCheck {
	return {
		id: CHECK_ID,
		locationId: LOCATION_ID,
		houseNameSnapshot: 'Stale House Name',
		shiftId: SHIFT_ID,
		operationalDate: '2026-03-04',
		shiftSlot: 2,
		kitchenTempTenths: 1180,
		bathTempTenths: 1130,
		staffId: CLERK_ID,
		staffNameSnapshot: STAFF_NAME,
		staffInitialsSnapshot: 'MS',
		observedAt: new Date('2026-03-04T14:05:00.000Z'),
		comments: 'Kitchen tap ran hot at shift start.',
		action: 'Adjusted mixing valve and notified the coordinator.',
		state: 'recheck_required',
		version: 7,
		voidedAt: null,
		voidedBy: null,
		voidReason: null,
		idempotencyKey: 'idem-key-9',
		operationalTimeZoneSnapshot: 'America/Chicago',
		createdAt: new Date('2026-03-04T14:06:00.000Z'),
		updatedAt: new Date('2026-03-04T15:06:00.000Z'),
		...overrides,
	};
}

function rawRecheck(
	overrides: Partial<RawInspectorWaterTemperatureRecheck> = {}
): RawInspectorWaterTemperatureRecheck {
	return {
		id: RECHECK_ID,
		checkId: CHECK_ID,
		fixture: 'kitchen',
		tempTenths: 1140,
		staffId: CLERK_ID,
		staffNameSnapshot: STAFF_NAME,
		staffInitialsSnapshot: 'RB',
		measuredAt: new Date('2026-03-04T16:30:00.000Z'),
		sequence: 2,
		supersededAt: null,
		supersededReason: null,
		voidedAt: null,
		createdAt: new Date('2026-03-04T16:31:00.000Z'),
		...overrides,
	};
}

// ============================================================================
// DEEP WALK
// ============================================================================

function collectKeysAndStrings(value: unknown, keys: Set<string>, strings: string[]): void {
	if (Array.isArray(value)) {
		for (const entry of value) collectKeysAndStrings(entry, keys, strings);
		return;
	}
	if (value && typeof value === 'object') {
		for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
			keys.add(key);
			collectKeysAndStrings(nested, keys, strings);
		}
		return;
	}
	if (typeof value === 'string') strings.push(value);
}

/** Walks the SERIALIZED projection so nested objects and arrays are covered,
 * not just the top level. */
function inspect(payload: unknown): {keys: Set<string>; strings: string[]; json: string} {
	const json = JSON.stringify(payload);
	const keys = new Set<string>();
	const strings: string[] = [];
	collectKeysAndStrings(JSON.parse(json), keys, strings);
	return {keys, strings, json};
}

function assertNoLeaks(payload: unknown): void {
	const {keys, json} = inspect(payload);
	for (const forbidden of INSPECTOR_WATER_TEMPERATURE_FORBIDDEN_KEYS) {
		assert.equal(keys.has(forbidden), false, `forbidden key "${forbidden}" reached the inspector`);
	}
	for (const secret of SENSITIVE_VALUES) {
		assert.equal(json.includes(secret), false, `sensitive value "${secret}" reached the inspector`);
	}
}

// ============================================================================
// TESTS
// ============================================================================

test('projection allowlists operational facts and strips identifiers, names, and audit metadata', () => {
	const data = projectInspectorWaterTemperatureMonth({
		location: {id: LOCATION_ID, name: 'House A'},
		year: 2026,
		month: 3,
		checks: [rawCheck()],
		rechecks: [rawRecheck()],
	});

	assert.deepEqual(Object.keys(data).sort(), ['checks', 'houseName', 'month', 'year']);
	assert.equal(data.houseName, 'House A');
	assert.equal(data.checks.length, 1);
	assert.deepEqual(Object.keys(data.checks[0]).sort(), [
		'action',
		'bathTempF',
		'comments',
		'kitchenTempF',
		'operationalDate',
		'rechecks',
		'shiftSlot',
		'staffInitials',
		'state',
	]);
	assert.deepEqual(Object.keys(data.checks[0].rechecks[0]).sort(), [
		'fixture',
		'measuredAt',
		'sequence',
		'staffInitials',
		'superseded',
		'tempF',
	]);

	// The operational facts an inspector legitimately needs are all present.
	assert.equal(data.checks[0].operationalDate, '2026-03-04');
	assert.equal(data.checks[0].shiftSlot, 2);
	assert.equal(data.checks[0].kitchenTempF, 118);
	assert.equal(data.checks[0].bathTempF, 113);
	assert.equal(data.checks[0].staffInitials, 'MS');
	assert.equal(data.checks[0].state, 'recheck_required');
	assert.equal(data.checks[0].comments, 'Kitchen tap ran hot at shift start.');
	assert.equal(data.checks[0].action, 'Adjusted mixing valve and notified the coordinator.');
	assert.equal(data.checks[0].rechecks[0].staffInitials, 'RB');
	assert.equal(data.checks[0].rechecks[0].tempF, 114);
	assert.equal(data.checks[0].rechecks[0].measuredAt, '2026-03-04T16:30:00.000Z');

	assertNoLeaks(data);
});

test('an unrecognized future DTO field cannot leak by default', () => {
	// A column added to the table later arrives on the raw row. The allowlist
	// -- not a denylist -- decides, so it is simply absent from the output.
	const data = projectInspectorWaterTemperatureMonth({
		location: {id: LOCATION_ID, name: 'House A'},
		year: 2026,
		month: 3,
		checks: [
			rawCheck({
				reviewerClerkUserId: CLERK_ID,
				internalRiskScore: 91,
				futureAuditPayload: {actor: STAFF_NAME, note: 'privileged'},
			} as Partial<RawInspectorWaterTemperatureCheck>),
		],
		rechecks: [rawRecheck({futureRecheckAudit: {actorId: CLERK_ID}} as Partial<RawInspectorWaterTemperatureRecheck>)],
	});

	const {keys} = inspect(data);
	assert.equal(keys.has('reviewerClerkUserId'), false);
	assert.equal(keys.has('internalRiskScore'), false);
	assert.equal(keys.has('futureAuditPayload'), false);
	assert.equal(keys.has('futureRecheckAudit'), false);
	assertNoLeaks(data);
});

test('voided records never reach an inspector even if a query returns them', () => {
	const data = projectInspectorWaterTemperatureMonth({
		location: {id: LOCATION_ID, name: 'House A'},
		year: 2026,
		month: 3,
		checks: [
			rawCheck({
				id: VOIDED_CHECK_ID,
				operationalDate: '2026-03-02',
				voidedAt: new Date('2026-03-03T10:00:00.000Z'),
				voidedBy: CLERK_ID,
				voidReason: 'Reason: mistyped by supervisor',
			}),
			rawCheck(),
		],
		rechecks: [rawRecheck({checkId: VOIDED_CHECK_ID, sequence: 1})],
	});

	assert.equal(data.checks.length, 1);
	assert.equal(data.checks[0].operationalDate, '2026-03-04');
	assertNoLeaks(data);
});

test('recheck chain keeps order and collapses supersession into one boolean fact', () => {
	const data = projectInspectorWaterTemperatureMonth({
		location: {id: LOCATION_ID, name: 'House A'},
		year: 2026,
		month: 3,
		checks: [rawCheck()],
		rechecks: [
			rawRecheck({sequence: 3, tempTenths: 1140, staffInitialsSnapshot: 'RB'}),
			rawRecheck({
				sequence: 1,
				tempTenths: 1160,
				staffInitialsSnapshot: 'MS',
				supersededAt: new Date('2026-03-04T16:00:00.000Z'),
				supersededReason: 'Reason: mistyped by supervisor',
			}),
			rawRecheck({sequence: 2, tempTenths: 1170, staffInitialsSnapshot: 'MS', voidedAt: new Date()}),
		],
	});

	assert.deepEqual(
		data.checks[0].rechecks.map((recheck) => [recheck.sequence, recheck.tempF, recheck.superseded]),
		[
			[1, 116, true],
			[2, 117, true],
			[3, 114, false],
		]
	);
	assertNoLeaks(data);
});

test('the original unsafe observation is preserved, never replaced by a safe recheck (R7)', () => {
	const data = projectInspectorWaterTemperatureMonth({
		location: {id: LOCATION_ID, name: 'House A'},
		year: 2026,
		month: 3,
		checks: [rawCheck({state: 'complete'})],
		rechecks: [rawRecheck({tempTenths: 1140, sequence: 1})],
	});
	assert.equal(data.checks[0].kitchenTempF, 118);
	assert.equal(data.checks[0].state, 'complete');
});

test('records are returned in date then shift order', () => {
	const data = projectInspectorWaterTemperatureMonth({
		location: {id: LOCATION_ID, name: 'House A'},
		year: 2026,
		month: 3,
		checks: [
			rawCheck({id: 'a', operationalDate: '2026-03-05', shiftSlot: 1, state: 'complete'}),
			rawCheck({id: 'b', operationalDate: '2026-03-04', shiftSlot: 3, state: 'complete'}),
			rawCheck({id: 'c', operationalDate: '2026-03-04', shiftSlot: 1, state: 'complete'}),
		],
		rechecks: [],
	});
	assert.deepEqual(
		data.checks.map((check) => `${check.operationalDate}|${check.shiftSlot}`),
		['2026-03-04|1', '2026-03-04|3', '2026-03-05|1']
	);
});

test('month bounds cover leap years and short months', () => {
	assert.deepEqual(inspectorWaterTemperatureMonthBounds(2028, 2), {
		start: '2028-02-01',
		end: '2028-02-29',
	});
	assert.deepEqual(inspectorWaterTemperatureMonthBounds(2027, 2), {
		start: '2027-02-01',
		end: '2027-02-28',
	});
	assert.deepEqual(inspectorWaterTemperatureMonthBounds(2026, 4), {
		start: '2026-04-01',
		end: '2026-04-30',
	});
	assert.throws(() => inspectorWaterTemperatureMonthBounds(2026, 13), TypeError);
});

test('selector validation refuses out-of-range, fractional, and non-numeric months and years', () => {
	assert.equal(isValidInspectorReportYear(2026), true);
	assert.equal(isValidInspectorReportYear(2019), false);
	assert.equal(isValidInspectorReportYear(2101), false);
	assert.equal(isValidInspectorReportYear(2026.5), false);
	assert.equal(isValidInspectorReportYear(Number.NaN), false);
	assert.equal(isValidInspectorReportMonth(1), true);
	assert.equal(isValidInspectorReportMonth(12), true);
	assert.equal(isValidInspectorReportMonth(0), false);
	assert.equal(isValidInspectorReportMonth(13), false);
});

test('projection fails closed on out-of-month rows and unrecognized enum values', () => {
	const base = {
		location: {id: LOCATION_ID, name: 'House A'},
		year: 2026,
		month: 3,
		rechecks: [],
	};
	assert.throws(
		() =>
			projectInspectorWaterTemperatureMonth({
				...base,
				checks: [rawCheck({operationalDate: '2026-04-01'})],
			}),
		TypeError
	);
	assert.throws(
		() => projectInspectorWaterTemperatureMonth({...base, checks: [rawCheck({shiftSlot: 4})]}),
		TypeError
	);
	assert.throws(
		() => projectInspectorWaterTemperatureMonth({...base, checks: [rawCheck({state: 'missing'})]}),
		TypeError
	);
	assert.throws(
		() =>
			projectInspectorWaterTemperatureMonth({
				location: {id: LOCATION_ID, name: 'House A'},
				year: 2026,
				month: 3,
				checks: [rawCheck()],
				rechecks: [rawRecheck({fixture: 'sink'})],
			}),
		TypeError
	);
	assert.throws(
		() => projectInspectorWaterTemperatureMonth({...base, month: 0, checks: []}),
		TypeError
	);
});
