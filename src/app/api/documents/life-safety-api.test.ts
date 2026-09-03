import assert from 'node:assert/strict';
import test from 'node:test';

import {z} from 'zod';
import {
	fireDrillReportCreateSchema,
	fireDrillReportUpdateSchema,
	lifeSafetyCollectionQuerySchema,
	lifeSafetyInspectionUpdateSchema,
	lifeSafetyLegacyQuerySchema,
} from '@/lib/validation-schemas';

setLifeSafetyTestEnv();

const lifeSafetyRouteModule = import('./_life-safety-route');
const smokeRouteModule = import('./smoke-detector-checks/route');
const smokeByIdRouteModule = import('./smoke-detector-checks/[id]/route');
const fireDrillRouteModule = import('./fire-drills/route');
const fireDrillByIdRouteModule = import('./fire-drills/[id]/route');

const LOCATION_ID = '11111111-1111-4111-8111-111111111111';
const RESIDENT_ID = '22222222-2222-4222-8222-222222222222';

const inspection = {
	locationId: LOCATION_ID,
	reportYear: 2026,
	reportMonth: 1,
	equipmentType: 'smoke' as const,
	inspectionDate: '2026-01-15',
	staffInitials: 'MP',
	outcome: 'pass' as const,
	notes: null,
};

const report = {
	locationId: LOCATION_ID,
	reportYear: 2026,
	sequence: 1 as const,
	drillDate: '2026-03-04',
	drillTime: '14:05',
	staffNames: ['Staff One'],
	participants: [{
		residentId: RESIDENT_ID,
		residentNameSnapshot: 'Client value is replaced for roster residents',
		participantSource: 'roster' as const,
		durationMinutes: 0,
		durationSeconds: 42,
		comment: null,
		position: 0,
	}],
};

test('v2 list queries require one concrete house and year', () => {
	assert.equal(
		lifeSafetyCollectionQuerySchema.safeParse({locationId: LOCATION_ID, year: '2026'}).success,
		true
	);
	for (const query of [{year: '2026'}, {locationId: 'all', year: '2026'}, {locationId: LOCATION_ID}]) {
		assert.equal(lifeSafetyCollectionQuerySchema.safeParse(query).success, false);
	}
});

test('updates require an expected version and reject drifted flat payloads', () => {
	assert.equal(
		lifeSafetyInspectionUpdateSchema.safeParse({expectedVersion: 2, entry: inspection}).success,
		true
	);
	assert.equal(lifeSafetyInspectionUpdateSchema.safeParse({...inspection, expectedVersion: 2}).success, false);
	assert.equal(
		fireDrillReportUpdateSchema.safeParse({expectedVersion: 3, report}).success,
		true
	);
	assert.equal(fireDrillReportUpdateSchema.safeParse({expectedVersion: 0, report}).success, false);
});

test('fire-drill aggregate contract rejects duplicate residents and unknown fields', () => {
	assert.equal(fireDrillReportCreateSchema.safeParse(report).success, true);
	assert.equal(
		fireDrillReportCreateSchema.safeParse({
			...report,
			participants: [report.participants[0], {...report.participants[0], position: 1}],
		}).success,
		false
	);
	assert.equal(fireDrillReportCreateSchema.safeParse({...report, createdBy: 'client'}).success, false);
});

test('legacy pagination is bounded and requires a concrete known-name candidate', () => {
	assert.deepEqual(
		lifeSafetyLegacyQuerySchema.parse({location: 'House One', year: '2026'}),
		{location: 'House One', year: 2026, limit: 50}
	);
	assert.equal(
		lifeSafetyLegacyQuerySchema.safeParse({location: 'House One', limit: '101'}).success,
		false
	);
	assert.equal(lifeSafetyLegacyQuerySchema.safeParse({location: 'all'}).success, false);
});

test('chunked JSON bodies over the limit are rejected without a content-length header', async () => {
	const {parseLifeSafetyJson, LifeSafetyRequestError} = await lifeSafetyRouteModule;
	let cancelled = false;
	const request = requestFromChunks([
		'{"payload":"',
		'a'.repeat(70_000),
		'b'.repeat(70_000),
		'"}',
	], () => {
		cancelled = true;
	});

	await assert.rejects(
		parseLifeSafetyJson(
			request,
			z.object({payload: z.string()}).strict()
		),
		(error: unknown) => error instanceof LifeSafetyRequestError && error.status === 413
	);
	assert.equal(cancelled, true);
});

test('chunked JSON bodies under the limit still parse correctly', async () => {
	const {parseLifeSafetyJson} = await lifeSafetyRouteModule;
	const request = requestFromChunks(['{"payload":"', 'hello', ' world"}']);
	assert.deepEqual(
		await parseLifeSafetyJson(
			request,
			z.object({payload: z.string()}).strict()
		),
		{payload: 'hello world'}
	);
});

test('both legacy route pairs deny every mutation method at runtime', async () => {
	const [
		{POST: smokePost, PATCH: smokePatch, DELETE: smokeDelete},
		{POST: smokeByIdPost, PATCH: smokeByIdPatch, DELETE: smokeByIdDelete},
		{POST: fireDrillPost, PATCH: fireDrillPatch, DELETE: fireDrillDelete},
		{POST: fireDrillByIdPost, PATCH: fireDrillByIdPatch, DELETE: fireDrillByIdDelete},
	] = await Promise.all([
		smokeRouteModule,
		smokeByIdRouteModule,
		fireDrillRouteModule,
		fireDrillByIdRouteModule,
	]);

	for (const [label, handlers] of [
		['smoke detector checks', [smokePost, smokePatch, smokeDelete]],
		['smoke detector checks by id', [smokeByIdPost, smokeByIdPatch, smokeByIdDelete]],
		['fire drills', [fireDrillPost, fireDrillPatch, fireDrillDelete]],
		['fire drill reports by id', [fireDrillByIdPost, fireDrillByIdPatch, fireDrillByIdDelete]],
	] as const) {
		for (const handler of handlers) {
			const response = await handler();
			assert.equal(response.status, 405, `${label} mutation should be denied`);
			assert.equal(response.headers.get('Allow'), 'GET', `${label} mutation should advertise GET`);
			assert.deepEqual(await response.json(), {
				error: 'Legacy life-safety records are read-only',
				code: 'LEGACY_READ_ONLY',
			});
		}
	}
});

function setLifeSafetyTestEnv() {
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

	return new Request('http://localhost/api/documents/life-safety-inspections', {
		method: 'POST',
		headers: {'content-type': 'application/json'},
		body: stream as any,
		duplex: 'half' as any,
	} as RequestInit);
}
