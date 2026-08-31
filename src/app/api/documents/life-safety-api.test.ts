import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
	fireDrillReportCreateSchema,
	fireDrillReportUpdateSchema,
	lifeSafetyCollectionQuerySchema,
	lifeSafetyInspectionUpdateSchema,
	lifeSafetyLegacyQuerySchema,
} from '@/lib/validation-schemas';

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

test('both legacy route pairs expose GET but deny every mutation method', async () => {
	for (const file of [
		'src/app/api/documents/smoke-detector-checks/route.ts',
		'src/app/api/documents/smoke-detector-checks/[id]/route.ts',
		'src/app/api/documents/fire-drills/route.ts',
		'src/app/api/documents/fire-drills/[id]/route.ts',
	]) {
		const source = await readFile(file, 'utf8');
		assert.match(source, /export async function GET/);
		for (const method of ['POST', 'PATCH', 'DELETE']) {
			assert.match(source, new RegExp(`export async function ${method}\\(\\) \\{ return legacyWriteDenied\\(\\); \\}`));
		}
	}
});
