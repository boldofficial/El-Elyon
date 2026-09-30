import assert from 'node:assert/strict';
import test from 'node:test';
import {createInspectorCareLogReportHandler} from './handler';

const SESSION = {
	accessId: 'access-1',
	locationId: '11111111-1111-4111-8111-111111111111',
	location: 'Maple House',
};
const ATTACKER_LOCATION_ID = '99999999-9999-4999-8999-999999999999';
const ENDPOINT = 'http://localhost/api/inspector/care-log-report';

function query(extra = ''): string {
	return `${ENDPOINT}?from=2026-09-01&to=2026-09-30${extra}`;
}

function handlerThatMustNotQuery(
	getSession: () => Promise<typeof SESSION | null>
) {
	return createInspectorCareLogReportHandler({
		getSession,
		getReport: async () => assert.fail('the report query must not run'),
		audit: async () => assert.fail('nothing should be audited'),
	});
}

test('no session fails with 401 before the report query', async () => {
	const response = await handlerThatMustNotQuery(async () => null)(new Request(query()));
	assert.equal(response.status, 401);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('a locationless session fails with 401 before the report query', async () => {
	const handler = handlerThatMustNotQuery(async () => ({...SESSION, locationId: '  '}));
	const response = await handler(new Request(query()));
	assert.equal(response.status, 401);
});

test('an invalid range fails with 400 before the report query', async () => {
	const handler = handlerThatMustNotQuery(async () => SESSION);
	for (const url of [
		ENDPOINT,
		`${ENDPOINT}?from=2026-09-30&to=2026-09-01`,
		`${ENDPOINT}?from=2024-01-01&to=2026-09-01`,
	]) {
		const response = await handler(new Request(url));
		assert.equal(response.status, 400, url);
	}
});

test('the location comes from the session, never from query parameters', async () => {
	const seen: string[] = [];
	const audited: number[] = [];
	const handler = createInspectorCareLogReportHandler({
		getSession: async () => SESSION,
		getReport: async (locationId, range) => {
			seen.push(locationId);
			assert.deepEqual(range, {from: '2026-09-01', to: '2026-09-30'});
			return {entries: [{}, {}]};
		},
		audit: async ({entryCount}) => {
			audited.push(entryCount);
		},
	});

	const response = await handler(
		new Request(query(`&locationId=${ATTACKER_LOCATION_ID}&location=Other`))
	);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(seen, [SESSION.locationId]);
	assert.deepEqual(audited, [2]);
});

test('a described query error maps to its status; anything else is a 500', async () => {
	class TooLarge extends Error {}
	const make = (error: Error) =>
		createInspectorCareLogReportHandler({
			getSession: async () => SESSION,
			getReport: async () => {
				throw error;
			},
			audit: async () => assert.fail('a failed report must not be audited'),
			describeError: (e) =>
				e instanceof TooLarge ? {status: 422, message: 'Too many'} : null,
		});

	const tooLarge = await make(new TooLarge())(new Request(query()));
	assert.equal(tooLarge.status, 422);
	assert.deepEqual(await tooLarge.json(), {error: 'Too many'});

	const originalError = console.error;
	console.error = () => {};
	try {
		const failed = await make(new Error('db down'))(new Request(query()));
		assert.equal(failed.status, 500);
	} finally {
		console.error = originalError;
	}
});
