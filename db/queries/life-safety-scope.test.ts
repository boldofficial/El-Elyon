import assert from 'node:assert/strict';
import test from 'node:test';
import {
	aliasesAreUnambiguous,
	matchUniqueAssignedLocations,
} from './life-safety-scope';

test('name-based author assignments fail closed for duplicate active locations', () => {
	const assigned = matchUniqueAssignedLocations(['House One'], [
		{id: 'first', name: 'House One'},
		{id: 'second', name: 'House One'},
	]);
	assert.equal(assigned, null);
});

test('name-based author assignments resolve every name exactly once', () => {
	const assigned = matchUniqueAssignedLocations(['House Two', 'House One'], [
		{id: 'first', name: 'House One'},
		{id: 'second', name: 'House Two'},
	]);
	assert.deepEqual(assigned, [
		{id: 'second', name: 'House Two'},
		{id: 'first', name: 'House One'},
	]);
	assert.equal(
		matchUniqueAssignedLocations(['Missing House'], [{id: 'first', name: 'House One'}]),
		null
	);
});

test('legacy aliases fail closed when a name belongs to multiple location ids', () => {
	assert.equal(
		aliasesAreUnambiguous([
			{locationId: 'first', name: 'Old House'},
			{locationId: 'second', name: 'Old House'},
		]),
		false
	);
	assert.equal(
		aliasesAreUnambiguous([
			{locationId: 'first', name: 'Old House'},
			{locationId: 'first', name: 'Current House'},
		]),
		true
	);
});
