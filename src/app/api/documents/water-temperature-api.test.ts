import assert from 'node:assert/strict';
import test from 'node:test';

import {
	waterTemperatureActionRequestSchema,
	waterTemperatureCommentsSchema,
	waterTemperatureCorrectionRequestSchema,
	waterTemperatureCreateRequestSchema,
	waterTemperatureIdempotencyKeySchema,
	waterTemperatureManualCreateSchema,
	waterTemperatureMonthQuerySchema,
	waterTemperatureRecheckRequestSchema,
	waterTemperatureRecheckRouteRequestSchema,
	waterTemperatureStaffCreateSchema,
	waterTemperatureSupersedeRequestSchema,
	waterTemperatureVoidRequestSchema,
} from '@/lib/validation-schemas';

setWaterTemperatureTestEnv();

const routeHelperModule = import('./_water-temperature-route');

const LOCATION_ID = '11111111-1111-4111-8111-111111111111';
const CHECK_ID = '22222222-2222-4222-8222-222222222222';
const RECHECK_ID = '33333333-3333-4333-8333-333333333333';

// ============================================================================
// STAFF CREATE (source: "shift") -- no identity fields accepted from the
// client (R16); only the observed values, comments, and an idempotency key.
// ============================================================================

test('staff create requests omit identity fields and require an idempotency key', () => {
	const valid = {
		source: 'shift' as const,
		kitchenTempF: 112.0,
		bathTempF: 114.0,
		comments: null,
		idempotencyKey: 'client-key-1',
	};
	assert.equal(waterTemperatureStaffCreateSchema.safeParse(valid).success, true);
	assert.equal(waterTemperatureCreateRequestSchema.safeParse(valid).success, true);

	// Cannot smuggle in server-derived identity/staff fields.
	for (const field of ['locationId', 'shiftSlot', 'operationalDate', 'staffId', 'staffName', 'staffInitials']) {
		assert.equal(
			waterTemperatureStaffCreateSchema.safeParse({...valid, [field]: 'x'}).success,
			false,
			`should reject unknown field ${field}`
		);
	}

	assert.equal(waterTemperatureStaffCreateSchema.safeParse({...valid, idempotencyKey: undefined}).success, false);
	assert.equal(waterTemperatureStaffCreateSchema.safeParse({...valid, idempotencyKey: ''}).success, false);
});

test('an above-range reading is a valid, storable staff create submission (never rejected for being unsafe)', () => {
	const unsafe = {
		source: 'shift' as const,
		kitchenTempF: 125.0,
		bathTempF: 113.0,
		comments: null,
		idempotencyKey: 'client-key-2',
	};
	assert.equal(waterTemperatureStaffCreateSchema.safeParse(unsafe).success, true);
});

test('manual create requires locationId/shiftSlot/operationalDate/staff snapshot and a reason', () => {
	const valid = {
		source: 'manual' as const,
		locationId: LOCATION_ID,
		shiftSlot: 2 as const,
		operationalDate: '2026-03-04',
		kitchenTempF: 112.0,
		bathTempF: 114.0,
		staffId: 'legacy-staff-1',
		staffName: 'Jordan Ellis',
		staffInitials: 'JE',
		observedAt: '2026-03-04T09:00:00.000Z',
		comments: null,
		reason: 'Backfilled from paper log',
		idempotencyKey: 'client-key-3',
	};
	assert.equal(waterTemperatureManualCreateSchema.safeParse(valid).success, true);
	assert.equal(waterTemperatureCreateRequestSchema.safeParse(valid).success, true);
	assert.equal(waterTemperatureManualCreateSchema.safeParse({...valid, reason: ''}).success, false);
	assert.equal(waterTemperatureManualCreateSchema.safeParse({...valid, shiftSlot: 4}).success, false);
});

test('create request discriminates cleanly and rejects an unknown source', () => {
	assert.equal(waterTemperatureCreateRequestSchema.safeParse({source: 'other'}).success, false);
});

// ============================================================================
// ACTION / RECHECK / SUPERSEDE (discriminated on `type`)
// ============================================================================

test('action requests require expectedVersion and nonblank action text within bounds', () => {
	const valid = {
		type: 'action' as const,
		expectedVersion: 1,
		action: 'Restricted resident access; notified maintenance',
		idempotencyKey: 'action-key-1',
	};
	assert.equal(waterTemperatureActionRequestSchema.safeParse(valid).success, true);
	assert.equal(waterTemperatureActionRequestSchema.safeParse({...valid, action: '   '}).success, false);
	assert.equal(waterTemperatureActionRequestSchema.safeParse({...valid, expectedVersion: 0}).success, false);
	assert.equal(waterTemperatureActionRequestSchema.safeParse({...valid, action: 'x'.repeat(2001)}).success, false);
});

test('recheck requests require a valid fixture and reject an unsafe reading only for precision, not value', () => {
	const valid = {
		type: 'recheck' as const,
		expectedVersion: 2,
		fixture: 'kitchen' as const,
		tempF: 125.0,
		measuredAt: '2026-03-04T10:00:00.000Z',
		idempotencyKey: 'recheck-key-1',
	};
	assert.equal(waterTemperatureRecheckRequestSchema.safeParse(valid).success, true);
	assert.equal(
		waterTemperatureRecheckRequestSchema.safeParse({...valid, fixture: 'garbage'}).success,
		false
	);
	assert.equal(
		waterTemperatureRecheckRequestSchema.safeParse({...valid, tempF: 125.87}).success,
		false,
		'more than one decimal place should be rejected'
	);
});

test('supersede requests require a recheckId and a nonblank reason', () => {
	const valid = {
		type: 'supersede' as const,
		expectedVersion: 3,
		recheckId: RECHECK_ID,
		reason: 'Fat-fingered reading; corrected below',
		idempotencyKey: 'supersede-key-1',
	};
	assert.equal(waterTemperatureSupersedeRequestSchema.safeParse(valid).success, true);
	assert.equal(waterTemperatureSupersedeRequestSchema.safeParse({...valid, reason: ''}).success, false);
	assert.equal(waterTemperatureSupersedeRequestSchema.safeParse({...valid, recheckId: 'not-a-uuid'}).success, false);
});

test('the rechecks route contract discriminates action/recheck/supersede and rejects an unknown type', () => {
	assert.equal(
		waterTemperatureRecheckRouteRequestSchema.safeParse({
			type: 'action',
			expectedVersion: 1,
			action: 'Documented',
			idempotencyKey: 'k1',
		}).success,
		true
	);
	assert.equal(waterTemperatureRecheckRouteRequestSchema.safeParse({type: 'void'}).success, false);
});

// ============================================================================
// CORRECTION / VOID
// ============================================================================

test('correction requests require a reason, expectedVersion, and both readings', () => {
	const valid = {
		expectedVersion: 4,
		reason: 'Corrected transposed digits',
		kitchenTempF: 112.0,
		bathTempF: 114.0,
		comments: null,
		action: null,
		idempotencyKey: 'correct-key-1',
	};
	assert.equal(waterTemperatureCorrectionRequestSchema.safeParse(valid).success, true);
	assert.equal(waterTemperatureCorrectionRequestSchema.safeParse({...valid, reason: ''}).success, false);
	assert.equal(
		waterTemperatureCorrectionRequestSchema.safeParse({...valid, kitchenTempF: 'hot' as unknown}).success,
		false
	);
});

test('void requests require a reason and expectedVersion', () => {
	const valid = {expectedVersion: 5, reason: 'Duplicate entry', idempotencyKey: 'void-key-1'};
	assert.equal(waterTemperatureVoidRequestSchema.safeParse(valid).success, true);
	assert.equal(waterTemperatureVoidRequestSchema.safeParse({...valid, reason: undefined}).success, false);
});

// ============================================================================
// NARRATIVE TEXT: length caps + control-character rejection (comments/
// action must not silently strip or corrupt content -- an over-length or
// control-character-laden submission must fail validation outright).
// ============================================================================

test('comments/action reject embedded control characters and overlong text without being silently normalized', () => {
	assert.equal(waterTemperatureCommentsSchema.safeParse('Fine, no issues.').success, true);
	assert.equal(waterTemperatureCommentsSchema.safeParse('Line one\nLine two').success, true, 'newlines are allowed');
	assert.equal(
		waterTemperatureCommentsSchema.safeParse('bad\u0000null').success,
		false,
		'NUL and other control bytes are rejected, not stripped'
	);
	assert.equal(waterTemperatureCommentsSchema.safeParse('x'.repeat(2001)).success, false);
	assert.equal(waterTemperatureCommentsSchema.safeParse(null).success, true);
	assert.equal(waterTemperatureCommentsSchema.safeParse(undefined).success, true);
});

test('idempotency keys are bounded and restricted to a safe character set', () => {
	assert.equal(waterTemperatureIdempotencyKeySchema.safeParse('abc-123_XYZ').success, true);
	assert.equal(waterTemperatureIdempotencyKeySchema.safeParse('').success, false);
	assert.equal(waterTemperatureIdempotencyKeySchema.safeParse('has space').success, false);
	assert.equal(waterTemperatureIdempotencyKeySchema.safeParse('x'.repeat(101)).success, false);
});

// ============================================================================
// MONTH QUERY
// ============================================================================

test('month queries require a concrete locationId/year/month and default includeVoided to false', () => {
	assert.deepEqual(
		waterTemperatureMonthQuerySchema.parse({locationId: LOCATION_ID, year: '2026', month: '3'}),
		{locationId: LOCATION_ID, year: 2026, month: 3, includeVoided: false}
	);
	assert.equal(waterTemperatureMonthQuerySchema.safeParse({locationId: LOCATION_ID, year: '2026'}).success, false);
	assert.equal(
		waterTemperatureMonthQuerySchema.safeParse({locationId: LOCATION_ID, year: '2026', month: '13'}).success,
		false
	);
});

// ============================================================================
// ROUTE HELPER: JSON body cap + typed error -> HTTP status/shape mapping,
// and the private/no-store cache header on every response.
// ============================================================================

test('chunked JSON bodies over the limit are rejected without a content-length header', async () => {
	const {parseWaterTemperatureJson, WaterTemperatureRequestError} = await routeHelperModule;
	let cancelled = false;
	const request = requestFromChunks(
		['{"payload":"', 'a'.repeat(70_000), 'b'.repeat(70_000), '"}'],
		() => {
			cancelled = true;
		}
	);

	await assert.rejects(
		parseWaterTemperatureJson(request, {parse: (v: unknown) => v} as never),
		(error: unknown) => error instanceof WaterTemperatureRequestError && error.status === 413
	);
	assert.equal(cancelled, true);
});

test('chunked JSON bodies under the limit still parse correctly', async () => {
	const {parseWaterTemperatureJson} = await routeHelperModule;
	const request = requestFromChunks(['{"payload":"', 'hello', ' world"}']);
	const zodLike = {parse: (v: unknown) => v};
	assert.deepEqual(await parseWaterTemperatureJson(request, zodLike as never), {payload: 'hello world'});
});

test('every response carries Cache-Control: private, no-store', async () => {
	const {waterTemperatureJson} = await routeHelperModule;
	const response = waterTemperatureJson({ok: true});
	assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('a version conflict maps to 409 with a typed code and the current record attached', async () => {
	const {waterTemperatureErrorResponse} = await routeHelperModule;
	const {WaterTemperatureConflictError} = await import('@/db/queries/water-temperature');
	const current = {id: CHECK_ID, state: 'complete'};
	const response = waterTemperatureErrorResponse(
		new WaterTemperatureConflictError('stale', 'VERSION_CONFLICT', current as never)
	);
	assert.equal(response.status, 409);
	assert.deepEqual(await response.json(), {error: 'stale', code: 'VERSION_CONFLICT', current});
	assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
});

test('a unique conflict on create lets the client recover the winning record', async () => {
	const {waterTemperatureErrorResponse} = await routeHelperModule;
	const {WaterTemperatureConflictError} = await import('@/db/queries/water-temperature');
	const winner = {id: CHECK_ID, state: 'complete_with_attention'};
	const response = waterTemperatureErrorResponse(
		new WaterTemperatureConflictError('taken', 'UNIQUE_CONFLICT', winner as never)
	);
	assert.equal(response.status, 409);
	const body = await response.json();
	assert.equal(body.code, 'UNIQUE_CONFLICT');
	assert.deepEqual(body.current, winner);
});

test('missing an active shift maps to a distinct 409 conflict code, not a generic failure', async () => {
	const {waterTemperatureErrorResponse} = await routeHelperModule;
	const {WaterTemperatureShiftRequiredError} = await import('@/db/queries/water-temperature');
	const response = waterTemperatureErrorResponse(new WaterTemperatureShiftRequiredError());
	assert.equal(response.status, 409);
	const body = await response.json();
	assert.equal(body.code, 'NO_ACTIVE_SHIFT');
});

test('absent and unauthorized records return the identical 404 shape', async () => {
	const {waterTemperatureErrorResponse} = await routeHelperModule;
	const {WaterTemperatureNotFoundError} = await import('@/db/queries/water-temperature');
	const response = waterTemperatureErrorResponse(new WaterTemperatureNotFoundError());
	assert.equal(response.status, 404);
	assert.deepEqual(await response.json(), {error: 'Not found'});
});

test('an access-denied error maps to 403 without leaking the underlying reason', async () => {
	const {waterTemperatureErrorResponse} = await routeHelperModule;
	const {AccessDeniedError} = await import('@/lib/db-helpers');
	const response = waterTemperatureErrorResponse(
		new AccessDeniedError('Admin or Supervisor access required')
	);
	assert.equal(response.status, 403);
	assert.deepEqual(await response.json(), {error: 'Access denied'});
});

test('the domain access-denied subclass also maps to 403', async () => {
	const {waterTemperatureErrorResponse} = await routeHelperModule;
	const {WaterTemperatureAccessDeniedError} = await import('@/db/queries/water-temperature');
	const response = waterTemperatureErrorResponse(new WaterTemperatureAccessDeniedError());
	assert.equal(response.status, 403);
	assert.deepEqual(await response.json(), {error: 'Access denied'});
});

// Regression: authorization must be recognised by TYPE, never by substring-
// matching human-readable error text. An unrelated infrastructure failure whose
// message happens to contain the word "access" must surface as a 500 outage --
// mapping it to 403 would silently disguise a database outage as an
// authorization result and hide it from operational error monitoring.
test('an internal error whose message contains "access" maps to 500, not 403', async () => {
	const {waterTemperatureErrorResponse} = await routeHelperModule;
	const originalConsoleError = console.error;
	console.error = () => {};
	try {
		for (const message of [
			'cannot access database connection',
			'Access to the pool was denied by the connection manager',
			'ECONNREFUSED while accessing the read replica',
		]) {
			const response = waterTemperatureErrorResponse(new Error(message));
			assert.equal(response.status, 500, `"${message}" must not be treated as authorization`);
			assert.deepEqual(await response.json(), {error: 'Internal server error'});
		}
	} finally {
		console.error = originalConsoleError;
	}
});

function setWaterTemperatureTestEnv() {
	const env = {
		DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
		AWS_REGION: 'us-east-1',
		AWS_ENDPOINT_URL: 'http://localhost:9000',
		AWS_ACCESS_KEY_ID: 'test',
		AWS_SECRET_ACCESS_KEY: 'test',
		AWS_S3_BUCKET_NAME: 'test-bucket',
		NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test',
		CLERK_SECRET_KEY: 'sk_test',
	};
	for (const [key, value] of Object.entries(env)) {
		if (!process.env[key]) process.env[key] = value;
	}
}

function requestFromChunks(chunks: string[], onCancel?: () => void): Request {
	const encoder = new TextEncoder();
	let index = 0;
	const stream = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (index >= chunks.length) {
				controller.close();
				return;
			}
			controller.enqueue(encoder.encode(chunks[index++] ?? ''));
		},
		cancel() {
			onCancel?.();
		},
	});

	return new Request('http://localhost/api/documents/water-temperature-checks', {
		method: 'POST',
		headers: {'content-type': 'application/json'},
		body: stream as any,
		duplex: 'half' as any,
	} as RequestInit);
}
