// lib/carb-log-summary.ts
//
// Pure grouping of carb log entries into one row per resident per day, which
// is how an oversight view wants to read them: a blank meal cell is a missed
// meal, visible straight down the column.

import {MEAL_SLOTS, type MealSlot} from './carb-log';

export interface SummarizableEntry {
	residentId: string;
	residentName: string;
	location: string;
	operationalDate: string;
	mealSlot: MealSlot;
	carbsGrams: number;
}

export interface MealCell {
	/** Total grams for this meal that day; snacks sum across the day. */
	grams: number;
	/** How many entries make up the cell (>1 only for snacks). */
	count: number;
}

export interface CarbLogDayRow {
	residentId: string;
	residentName: string;
	location: string;
	operationalDate: string;
	meals: Partial<Record<MealSlot, MealCell>>;
	/** Sum of every meal including snacks. */
	totalGrams: number;
	/** Main meals (breakfast/lunch/dinner) with no entry that day. */
	missingMainMeals: MealSlot[];
}

const MAIN_MEALS: MealSlot[] = MEAL_SLOTS.filter((slot) => slot !== 'snack');

/**
 * Groups entries into resident-day rows, newest day first and residents
 * alphabetical within a day.
 *
 * `missingMainMeals` is computed against the whole day regardless of the
 * time of day: this view is read after the fact, so a day that only ever
 * got breakfast reads as missing lunch and dinner even if you open it at
 * noon. Live "is it due yet" logic belongs in deriveSlotStates, not here.
 */
export function summarizeCarbLogDays(
	entries: readonly SummarizableEntry[]
): CarbLogDayRow[] {
	const rows = new Map<string, CarbLogDayRow>();

	for (const entry of entries) {
		const key = `${entry.operationalDate}|${entry.residentId}`;
		let row = rows.get(key);
		if (!row) {
			row = {
				residentId: entry.residentId,
				residentName: entry.residentName,
				location: entry.location,
				operationalDate: entry.operationalDate,
				meals: {},
				totalGrams: 0,
				missingMainMeals: [],
			};
			rows.set(key, row);
		}

		const cell = row.meals[entry.mealSlot];
		row.meals[entry.mealSlot] = {
			grams: (cell?.grams ?? 0) + entry.carbsGrams,
			count: (cell?.count ?? 0) + 1,
		};
		row.totalGrams += entry.carbsGrams;
	}

	const result = Array.from(rows.values());
	for (const row of result) {
		row.missingMainMeals = MAIN_MEALS.filter((slot) => !row.meals[slot]);
	}

	return result.sort((a, b) => {
		if (a.operationalDate !== b.operationalDate) {
			return a.operationalDate < b.operationalDate ? 1 : -1;
		}
		if (a.location !== b.location) return a.location.localeCompare(b.location);
		return a.residentName.localeCompare(b.residentName);
	});
}
