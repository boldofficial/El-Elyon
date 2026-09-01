import assert from 'node:assert/strict';
import test from 'node:test';
import {InspectorLifeSafetyScopeError} from '@/lib/inspector-life-safety-projection';
import {createInspectorLifeSafetyHandler} from './handler';

const sessionLocationId = '11111111-1111-4111-8111-111111111111';

test('inspector life-safety route rejects requests without a live session', async () => {
	const handler = createInspectorLifeSafetyHandler({
		getSession: async () => null,
		getData: async () => assert.fail('data query must not run without a session'),
	});

	const response = await handler(new Request('http://localhost/api/inspector/life-safety'));
	assert.equal(response.status, 401);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(await response.json(), {error: 'No active session'});
});

test('inspector life-safety route uses only the immutable session location', async () => {
	let queriedLocationId: string | undefined;
	const payload = {houseName: 'Authorized House'};
	const handler = createInspectorLifeSafetyHandler({
		getSession: async () => ({locationId: sessionLocationId}),
		getData: async (locationId) => {
			queriedLocationId = locationId;
			return payload;
		},
	});
	const request = new Request(
		'http://localhost/api/inspector/life-safety?locationId=attacker-location',
		{headers: {'x-location-id': 'attacker-location'}}
	);

	const response = await handler(request);
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.equal(queriedLocationId, sessionLocationId);
	assert.deepEqual(await response.json(), payload);
});

test('inspector life-safety route returns a non-cacheable 404 for an unavailable scope', async () => {
	const handler = createInspectorLifeSafetyHandler({
		getSession: async () => ({locationId: sessionLocationId}),
		getData: async () => {
			throw new InspectorLifeSafetyScopeError();
		},
	});

	const response = await handler(new Request('http://localhost/api/inspector/life-safety'));
	assert.equal(response.status, 404);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(await response.json(), {error: 'Life-safety records unavailable'});
});
