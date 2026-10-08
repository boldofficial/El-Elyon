import assert from 'node:assert/strict';
import test from 'node:test';
import type {AdminPrivilege} from '@/lib/admin-privileges';
import {createAdminCareLogReportHandler} from './handler';

class AccessDeniedError extends Error {}

const ENDPOINT = 'http://localhost/api/admin/care-log-report';
const LOCATION_ID = '11111111-1111-4111-8111-111111111111';

function query(extra = ''): string {
	return `${ENDPOINT}?locationId=${LOCATION_ID}&from=2026-09-01&to=2026-09-30${extra}`;
}

/** Grants access only to the given (privilege-holding) users; admins are modeled as holding everything. */
function permissions(grants: Record<string, AdminPrivilege[] | 'admin'>) {
	const checked: AdminPrivilege[] = [];
	return {
		checked,
		requireAdminOrPrivilege: async (userId: string, privilege: AdminPrivilege) => {
			checked.push(privilege);
			const grant = grants[userId];
			if (grant === 'admin' || grant?.includes(privilege)) return;
			throw new AccessDeniedError('Admin privilege required');
		},
	};
}

function handlerFor(userId: string | null, grants: Record<string, AdminPrivilege[] | 'admin'>) {
	const perms = permissions(grants);
	const audited: string[] = [];
	const handler = createAdminCareLogReportHandler({
		getUserId: async () => userId,
		requireAdminOrPrivilege: perms.requireAdminOrPrivilege,
		isAccessDenied: (error) => error instanceof AccessDeniedError,
		getReport: async () => ({location: 'Maple House', entries: [{}, {}, {}]}),
		audit: async (event) => {
			audited.push(`${event.userId}:${event.location}:${event.entryCount}`);
		},
	});
	return {handler, checked: perms.checked, audited};
}

test('signed-out requests get 401', async () => {
	const {handler, checked} = handlerFor(null, {});
	const response = await handler(new Request(query()));
	assert.equal(response.status, 401);
	assert.deepEqual(checked, []);
});

test('admins can print any location', async () => {
	const {handler, audited} = handlerFor('admin-1', {'admin-1': 'admin'});
	const response = await handler(new Request(query()));
	assert.equal(response.status, 200);
	assert.equal(response.headers.get('cache-control'), 'private, no-store');
	assert.deepEqual(audited, ['admin-1:Maple House:3']);
});

test('a supervisor with "View Care Logs & Incidents" can print, and it is audited as them', async () => {
	const {handler, checked, audited} = handlerFor('sup-1', {'sup-1': ['view_care_logs']});
	const response = await handler(new Request(query()));
	assert.equal(response.status, 200);
	assert.deepEqual(checked, ['view_care_logs']);
	assert.deepEqual(audited, ['sup-1:Maple House:3']);
});

test('staff without that permission get 403 and nothing is read or audited', async () => {
	const {handler, audited} = handlerFor('sup-2', {'sup-2': ['manage_memos']});
	const response = await handler(new Request(query()));
	assert.equal(response.status, 403);
	assert.match((await response.json()).error, /View Care Logs & Incidents/);
	assert.deepEqual(audited, []);
});

test('missing location or bad range gets 400', async () => {
	const {handler} = handlerFor('admin-1', {'admin-1': 'admin'});
	for (const url of [
		`${ENDPOINT}?from=2026-09-01&to=2026-09-30`,
		`${ENDPOINT}?locationId=${LOCATION_ID}&from=2026-09-30&to=2026-09-01`,
	]) {
		const response = await handler(new Request(url));
		assert.equal(response.status, 400, url);
	}
});
