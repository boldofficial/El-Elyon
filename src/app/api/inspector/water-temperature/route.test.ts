import assert from 'node:assert/strict';
import test from 'node:test';
import {
	INSPECTOR_WATER_TEMPERATURE_FORBIDDEN_KEYS,
	InspectorWaterTemperatureScopeError,
	projectInspectorWaterTemperatureMonth,
} from '@/lib/inspector-water-temperature-projection';
import {createInspectorWaterTemperatureHandler} from './handler';

const SESSION_LOCATION_ID = '11111111-1111-4111-8111-111111111111';
const ATTACKER_LOCATION_ID = '99999999-9999-4999-8999-999999999999';
const SESSION_TOKEN = 'accessid-abc.deadbeefdeadbeefdeadbeefdeadbeef';

const ENDPOINT = 'http://localhost/api/inspector/water-temperature';

function query(extra = ''): string {
	return `${ENDPOINT}?year=2026&month=3${extra}`;
}

/** A dependency set whose data query FAILS the test if it is ever reached. */
function handlerThatMustNotQuery(
	getSession: (request: Request) => Promise<{locationId: string} | null>
) {
	return createInspectorWaterTemperatureHandler({
		getSession,
		getData: async () => {
			assert.fail('the water-temperature query must not run');
		},
	});
}

// ============================================================================
// SESSION BOUNDARY -- fails BEFORE the water-temperature query
// ============================================================================

test('a missing, expired, or revoked grant fails before the water-temperature query', async () => {
	// getInspectorSession returns null for a missing cookie, a bad signature,
	// a revoked grant, an expired grant, and an inactive location alike, so
	// all of those collapse into this single fail-closed path.
	const handler = handlerThatMustNotQuery(async () => null);

	const response = await handler(new Request(query()));
	assert.equal(response.status, 401);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(await response.json(), {error: 'No active session'});
});

test('a malformed or locationless session fails before the water-temperature query', async () => {
	for (const session of [
		{locationId: ''} as {locationId: string},
		{locationId: '   '} as {locationId: string},
		{locationId: undefined} as unknown as {locationId: string},
		{} as {locationId: string},
	]) {
		const handler = handlerThatMustNotQuery(async () => session);
		const response = await handler(new Request(query()));
		assert.equal(response.status, 401);
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
	}
});

// ============================================================================
// SCOPE ISOLATION -- query, body, and header vectors (AE10)
// ============================================================================

test('an attacker-supplied query parameter cannot change the inspector house', async () => {
	const seen: string[] = [];
	const handler = createInspectorWaterTemperatureHandler({
		getSession: async () => ({locationId: SESSION_LOCATION_ID}),
		getData: async (locationId) => {
			seen.push(locationId);
			return {houseName: 'Authorized House', year: 2026, month: 3, checks: []};
		},
	});

	const response = await handler(
		new Request(
			query(
				`&locationId=${ATTACKER_LOCATION_ID}&location=Other+House&house=Other+House` +
					`&houseName=Other+House&scope=all&includeVoided=true`
			)
		)
	);

	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(seen, [SESSION_LOCATION_ID]);
	assert.equal((await response.json()).houseName, 'Authorized House');
});

test('an attacker-supplied request body cannot change the inspector house', async () => {
	const seen: string[] = [];
	const handler = createInspectorWaterTemperatureHandler({
		getSession: async () => ({locationId: SESSION_LOCATION_ID}),
		getData: async (locationId) => {
			seen.push(locationId);
			return {houseName: 'Authorized House', year: 2026, month: 3, checks: []};
		},
	});

	const request = new Request(query(), {
		method: 'POST',
		headers: {'content-type': 'application/json'},
		body: JSON.stringify({locationId: ATTACKER_LOCATION_ID, house: 'Other House'}),
	});
	const response = await handler(request);

	assert.equal(response.status, 200);
	assert.deepEqual(seen, [SESSION_LOCATION_ID]);
	// The handler never reads the body at all, so nothing in it can be honoured.
	assert.equal(request.bodyUsed, false);
});

test('attacker-supplied headers cannot change the inspector house', async () => {
	const seen: string[] = [];
	const handler = createInspectorWaterTemperatureHandler({
		getSession: async () => ({locationId: SESSION_LOCATION_ID}),
		getData: async (locationId) => {
			seen.push(locationId);
			return {houseName: 'Authorized House', year: 2026, month: 3, checks: []};
		},
	});

	const response = await handler(
		new Request(query(), {
			headers: {
				'x-location-id': ATTACKER_LOCATION_ID,
				'x-house': 'Other House',
				'x-forwarded-location': 'Other House',
				referer: `${ENDPOINT}?locationId=${ATTACKER_LOCATION_ID}`,
			},
		})
	);

	assert.equal(response.status, 200);
	assert.deepEqual(seen, [SESSION_LOCATION_ID]);
});

// ============================================================================
// MONTH/YEAR SELECTORS -- the only accepted client input
// ============================================================================

test('the month and year selectors are passed through once validated', async () => {
	const calls: Array<[string, number, number]> = [];
	const handler = createInspectorWaterTemperatureHandler({
		getSession: async () => ({locationId: SESSION_LOCATION_ID}),
		getData: async (locationId, year, month) => {
			calls.push([locationId, year, month]);
			return {houseName: 'Authorized House', year, month, checks: []};
		},
	});

	const response = await handler(new Request(`${ENDPOINT}?year=2028&month=2`));
	assert.equal(response.status, 200);
	assert.deepEqual(calls, [[SESSION_LOCATION_ID, 2028, 2]]);
});

test('an absent or out-of-range month/year is rejected before the water-temperature query', async () => {
	for (const search of [
		'',
		'?year=2026',
		'?month=3',
		'?year=2026&month=0',
		'?year=2026&month=13',
		'?year=2026&month=3.5',
		'?year=2019&month=3',
		'?year=2101&month=3',
		'?year=abc&month=3',
		'?year=2026&month=%3Cscript%3E',
	]) {
		const handler = handlerThatMustNotQuery(async () => ({locationId: SESSION_LOCATION_ID}));
		const response = await handler(new Request(`${ENDPOINT}${search}`));
		assert.equal(response.status, 400, `expected 400 for "${search}"`);
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
	}
});

// ============================================================================
// FAILURE MODES
// ============================================================================

test('an unavailable scope returns a non-cacheable 404', async () => {
	const handler = createInspectorWaterTemperatureHandler({
		getSession: async () => ({locationId: SESSION_LOCATION_ID}),
		getData: async () => {
			throw new InspectorWaterTemperatureScopeError();
		},
	});

	const response = await handler(new Request(query()));
	assert.equal(response.status, 404);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(await response.json(), {error: 'Water temperature records unavailable'});
});

test('an unexpected failure returns a non-cacheable 500 and never logs the session token', async () => {
	const logged: unknown[] = [];
	const original = console.error;
	console.error = (...args: unknown[]) => {
		logged.push(...args);
	};

	try {
		const handler = createInspectorWaterTemperatureHandler({
			getSession: async () => ({locationId: SESSION_LOCATION_ID}),
			getData: async () => {
				throw new Error('connection reset');
			},
		});
		const response = await handler(
			new Request(query(), {headers: {cookie: `inspector_session=${SESSION_TOKEN}`}})
		);

		assert.equal(response.status, 500);
		assert.equal(response.headers.get('cache-control'), 'private, no-store');
		assert.deepEqual(await response.json(), {error: 'Failed to load water temperature records'});
	} finally {
		console.error = original;
	}

	const serialized = logged.map((entry) => String(entry)).join(' ');
	assert.equal(serialized.includes(SESSION_TOKEN), false);
	assert.equal(serialized.includes('inspector_session'), false);
	assert.equal(serialized.includes(SESSION_LOCATION_ID), false);
});

// ============================================================================
// RESPONSE ALLOWLIST -- deep-walk the serialized HTTP response
// ============================================================================

test('the serialized response carries operational facts and no forbidden key or value at any depth', async () => {
	const CLERK_ID = 'user_2clerkSECRET';
	const STAFF_NAME = 'Morgan Steele';
	const CHECK_ID = '22222222-2222-4222-8222-222222222222';

	const handler = createInspectorWaterTemperatureHandler({
		getSession: async () => ({locationId: SESSION_LOCATION_ID}),
		getData: async (locationId, year, month) =>
			// The real projection, fed real secret-bearing rows.
			projectInspectorWaterTemperatureMonth({
				location: {id: locationId, name: 'House A'},
				year,
				month,
				checks: [
					{
						id: CHECK_ID,
						locationId,
						houseNameSnapshot: 'House A',
						shiftId: '55555555-5555-4555-8555-555555555555',
						operationalDate: '2026-03-04',
						shiftSlot: 2,
						kitchenTempTenths: 1180,
						bathTempTenths: 1130,
						staffId: CLERK_ID,
						staffNameSnapshot: STAFF_NAME,
						staffInitialsSnapshot: 'MS',
						observedAt: new Date('2026-03-04T14:05:00.000Z'),
						comments: 'Kitchen tap ran hot.',
						action: 'Adjusted the mixing valve.',
						state: 'recheck_required',
						version: 7,
						voidedAt: null,
						voidedBy: null,
						voidReason: null,
					},
				],
				rechecks: [
					{
						id: '44444444-4444-4444-8444-444444444444',
						checkId: CHECK_ID,
						fixture: 'kitchen',
						tempTenths: 1160,
						staffId: CLERK_ID,
						staffNameSnapshot: STAFF_NAME,
						staffInitialsSnapshot: 'RB',
						measuredAt: new Date('2026-03-04T16:30:00.000Z'),
						sequence: 1,
						supersededAt: null,
						voidedAt: null,
					},
				],
			}),
	});

	const response = await handler(new Request(query()));
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');

	const text = await response.text();
	const keys = new Set<string>();
	walk(JSON.parse(text), keys);

	for (const forbidden of INSPECTOR_WATER_TEMPERATURE_FORBIDDEN_KEYS) {
		assert.equal(keys.has(forbidden), false, `forbidden key "${forbidden}" reached the response`);
	}
	for (const secret of [CLERK_ID, STAFF_NAME, CHECK_ID, SESSION_LOCATION_ID]) {
		assert.equal(text.includes(secret), false, `sensitive value "${secret}" reached the response`);
	}

	// The facts the printed form needs ARE present.
	assert.deepEqual([...keys].sort(), [
		'action',
		'bathTempF',
		'checks',
		'comments',
		'fixture',
		'houseName',
		'kitchenTempF',
		'measuredAt',
		'month',
		'operationalDate',
		'rechecks',
		'sequence',
		'shiftSlot',
		'staffInitials',
		'state',
		'superseded',
		'tempF',
		'year',
	]);
	assert.equal(text.includes('118'), true);
	assert.equal(text.includes('MS'), true);
});

function walk(value: unknown, keys: Set<string>): void {
	if (Array.isArray(value)) {
		for (const entry of value) walk(entry, keys);
		return;
	}
	if (value && typeof value === 'object') {
		for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
			keys.add(key);
			walk(nested, keys);
		}
	}
}
