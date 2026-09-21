// lib/carb-log.ts
//
// Fixed schedule + validation for the per-meal carbohydrate log. This is the
// first (hand-built) instance of what will become admin-defined custom log
// templates; it deliberately reuses the generic slot model so the rows and
// the reminder logic migrate unchanged when that lands.

import type {LogSchedule, ScheduleSlot} from './custom-log-schedule';

export const MEAL_SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

export const MEAL_SLOT_LABELS: Record<MealSlot, string> = {
	breakfast: 'Breakfast',
	lunch: 'Lunch',
	dinner: 'Dinner',
	snack: 'Snack',
};

/**
 * Only the three main meals are *expected* (and therefore flagged when
 * missing). Snacks are logged ad hoc and may occur several times a day.
 */
export const CARB_LOG_SCHEDULE: LogSchedule = {
	period: 'day',
	slots: [
		{key: 'breakfast', label: 'Breakfast', from: '06:00', to: '10:00'},
		{key: 'lunch', label: 'Lunch', from: '11:00', to: '14:30'},
		{key: 'dinner', label: 'Dinner', from: '16:30', to: '20:30'},
	],
};

export const EXPECTED_MEAL_SLOTS: ReadonlySet<string> = new Set(
	CARB_LOG_SCHEDULE.slots.map((slot: ScheduleSlot) => slot.key)
);

export const CARBS_GRAMS_MIN = 0;
export const CARBS_GRAMS_MAX = 1000;

export function isMealSlot(value: unknown): value is MealSlot {
	return typeof value === 'string' && (MEAL_SLOTS as readonly string[]).includes(value);
}

export function isValidCarbsGrams(value: unknown): value is number {
	return (
		typeof value === 'number' &&
		Number.isInteger(value) &&
		value >= CARBS_GRAMS_MIN &&
		value <= CARBS_GRAMS_MAX
	);
}
