import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

test('inspector life-safety route scopes only from the live session and disables caching', async () => {
	const source = await readFile('src/app/api/inspector/life-safety/route.ts', 'utf8');
	assert.match(source, /getInspectorSession\(request\)/);
	assert.match(source, /getInspectorLifeSafetyData\(session\.locationId\)/);
	assert.match(source, /Cache-Control.*private, no-store/);
	assert.doesNotMatch(source, /searchParams|request\.json|request\.headers\.get\(['"]location/);
});
