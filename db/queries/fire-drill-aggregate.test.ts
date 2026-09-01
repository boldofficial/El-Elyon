import assert from 'node:assert/strict';
import test from 'node:test';
import {groupFireDrillJoinRows} from './fire-drill-aggregate';

test('joined fire-drill rows become ordered aggregates without duplicate headers', () => {
	const reports = groupFireDrillJoinRows([
		{report: {id: 'first', sequence: 1}, participant: {name: 'Resident A'}},
		{report: {id: 'first', sequence: 1}, participant: {name: 'Resident B'}},
		{report: {id: 'second', sequence: 2}, participant: null},
	]);

	assert.deepEqual(reports, [
		{
			id: 'first',
			sequence: 1,
			participants: [{name: 'Resident A'}, {name: 'Resident B'}],
		},
		{id: 'second', sequence: 2, participants: []},
	]);
});
