// lib/log-period.ts
//
// The period picker shared by the carb log and blood sugar log screens. Staff
// choose either the recent window the screen loads by default or one calendar
// month; the same choice drives both the history table and the printed sheet.
// "Today" is always the operational date the server reported, never the
// browser clock, so a night shift after midnight still sees the right month.

import {monthOf, shiftMonth, type CalendarMonth} from './task-calendar';

/** The default window: the last 14 operational days. */
export const RECENT_PERIOD = 'recent';

/** How many calendar months back the picker offers, counting this one. */
export const MONTHS_OFFERED = 24;

/** RECENT_PERIOD, or a calendar month as "YYYY-MM". */
export type LogPeriod = string;

const MONTH_KEY_RE = /^(\d{4})-(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

export function monthKey({year, month}: CalendarMonth): string {
	return `${year}-${pad(month)}`;
}

export function parseMonthKey(key: string): CalendarMonth | null {
	const match = MONTH_KEY_RE.exec(key);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (month < 1 || month > 12) return null;
	return {year, month};
}

/** Inclusive first and last day of a "YYYY-MM" month. */
export function monthRange(key: string): {from: string; to: string} {
	const parsed = parseMonthKey(key);
	if (!parsed) throw new Error(`Invalid month: ${key}`);
	const lastDay = new Date(Date.UTC(parsed.year, parsed.month, 0)).getUTCDate();
	return {
		from: `${key}-01`,
		to: `${key}-${pad(lastDay)}`,
	};
}

/** "November 2026". */
export function monthLabel(key: string): string {
	const parsed = parseMonthKey(key);
	if (!parsed) return key;
	return new Date(Date.UTC(parsed.year, parsed.month - 1, 1)).toLocaleDateString('en-US', {
		month: 'long',
		year: 'numeric',
		timeZone: 'UTC',
	});
}

export interface PeriodOption {
	value: LogPeriod;
	label: string;
}

/**
 * Picker options, newest first: the recent window, this month, then each
 * earlier month back to MONTHS_OFFERED.
 */
export function periodOptions(today: string, count = MONTHS_OFFERED): PeriodOption[] {
	const current = monthOf(today);
	const options: PeriodOption[] = [{value: RECENT_PERIOD, label: 'Last 14 days'}];
	for (let i = 0; i < count; i++) {
		const key = monthKey(shiftMonth(current, -i));
		options.push({value: key, label: i === 0 ? `This month (${monthLabel(key)})` : monthLabel(key)});
	}
	return options;
}

/** The month a print covers: the chosen month, or this month for the recent window. */
export function printMonthFor(period: LogPeriod, today: string): string {
	return parseMonthKey(period) ? period : monthKey(monthOf(today));
}
