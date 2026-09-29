import {test} from 'node:test';
import assert from 'node:assert/strict';
import {summarizeCarbLogDays, type SummarizableEntry} from './carb-log-summary';

const entry = (
	over: Partial<SummarizableEntry> & Pick<SummarizableEntry, 'mealSlot' | 'carbsGrams'>
): SummarizableEntry => ({
	residentId: 'r1',
	residentName: 'Joy Lackey',
	location: 'EMMANUEL FAMILY HOME',
	operationalDate: '2026-09-21',
	...over,
});

test('groups entries into one row per resident per day', () => {
	const rows = summarizeCarbLogDays([
		entry({mealSlot: 'breakfast', carbsGrams: 45}),
		entry({mealSlot: 'lunch', carbsGrams: 60}),
		entry({mealSlot: 'breakfast', carbsGrams: 30, residentId: 'r2', residentName: 'Sharon Jones'}),
	]);
	assert.equal(rows.length, 2);
	assert.equal(rows[0].totalGrams, 105);
	assert.equal(rows[0].meals.lunch?.grams, 60);
});

test('snacks sum across the day and report their count', () => {
	const rows = summarizeCarbLogDays([
		entry({mealSlot: 'snack', carbsGrams: 15}),
		entry({mealSlot: 'snack', carbsGrams: 20}),
	]);
	assert.deepEqual(rows[0].meals.snack, {grams: 35, count: 2});
	assert.equal(rows[0].totalGrams, 35);
});

test('missing main meals are listed; snacks never count as missing', () => {
	const rows = summarizeCarbLogDays([
		entry({mealSlot: 'breakfast', carbsGrams: 45}),
	]);
	assert.deepEqual(rows[0].missingMainMeals, ['lunch', 'dinner']);
});

test('a full day has no missing meals even without a snack', () => {
	const rows = summarizeCarbLogDays([
		entry({mealSlot: 'breakfast', carbsGrams: 45}),
		entry({mealSlot: 'lunch', carbsGrams: 60}),
		entry({mealSlot: 'dinner', carbsGrams: 50}),
	]);
	assert.deepEqual(rows[0].missingMainMeals, []);
});

test('rows are newest day first, then location, then resident name', () => {
	const rows = summarizeCarbLogDays([
		entry({mealSlot: 'lunch', carbsGrams: 10, operationalDate: '2026-09-19'}),
		entry({mealSlot: 'lunch', carbsGrams: 10, operationalDate: '2026-09-21'}),
		entry({
			mealSlot: 'lunch',
			carbsGrams: 10,
			operationalDate: '2026-09-21',
			residentId: 'r0',
			residentName: 'Aaron Smith',
		}),
	]);
	assert.deepEqual(
		rows.map((r) => `${r.operationalDate}:${r.residentName}`),
		['2026-09-21:Aaron Smith', '2026-09-21:Joy Lackey', '2026-09-19:Joy Lackey']
	);
});

test('empty input yields no rows', () => {
	assert.deepEqual(summarizeCarbLogDays([]), []);
});
