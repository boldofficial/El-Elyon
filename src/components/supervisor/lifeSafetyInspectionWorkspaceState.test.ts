import assert from 'node:assert/strict';
import test from 'node:test';

import {
	isLifeSafetyInspectionScopeReady,
	sameLifeSafetyInspectionScope,
} from './lifeSafetyInspectionWorkspaceState';

const scopeA = {locationId: '11111111-1111-4111-8111-111111111111', year: 2026};
const scopeB = {locationId: '22222222-2222-4222-8222-222222222222', year: 2026};

test('inspection workspace scope readiness tracks the loaded house and year', () => {
	assert.equal(
		isLifeSafetyInspectionScopeReady({
			currentScope: scopeA,
			loadedScope: scopeA,
			recordsState: 'ready',
		}),
		true
	);
	assert.equal(
		isLifeSafetyInspectionScopeReady({
			currentScope: scopeB,
			loadedScope: scopeA,
			recordsState: 'ready',
		}),
		false
	);
	assert.equal(
		isLifeSafetyInspectionScopeReady({
			currentScope: scopeB,
			loadedScope: scopeB,
			recordsState: 'error',
		}),
		false
	);
});

test('inspection workspace scope comparison rejects stale or partial matches', () => {
	assert.equal(sameLifeSafetyInspectionScope(scopeA, scopeA), true);
	assert.equal(sameLifeSafetyInspectionScope(scopeA, scopeB), false);
	assert.equal(sameLifeSafetyInspectionScope(scopeA, null), false);
	assert.equal(sameLifeSafetyInspectionScope(null, scopeA), false);
});
