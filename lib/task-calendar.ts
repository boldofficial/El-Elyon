// lib/task-calendar.ts
//
// Pure helpers behind the task calendar on the shift screen: lay out a month
// as weeks, and work out how each day should be marked. No dates are read
// from the clock here; "today" is always passed in as the operational date
// the server reported, so the calendar agrees with the task list about what
// is overdue.

import {classifyTask} from './tasks';

export interface CalendarMonth {
	/** Full year, e.g. 2026. */
	year: number;
	/** 1–12. */
	month: number;
}

export interface CalendarDay {
	/** "YYYY-MM-DD". */
	date: string;
	dayOfMonth: number;
	/** False for the leading/trailing days borrowed from neighbouring months. */
	inMonth: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function monthOf(isoDate: string): CalendarMonth {
	const [year, month] = isoDate.split('-').map(Number);
	return {year, month};
}

export function shiftMonth({year, month}: CalendarMonth, by: number): CalendarMonth {
	const index = year * 12 + (month - 1) + by;
	return {year: Math.floor(index / 12), month: (index % 12) + 1};
}

export function sameMonth(a: CalendarMonth, b: CalendarMonth) {
	return a.year === b.year && a.month === b.month;
}

/**
 * The month as complete Sunday-to-Saturday weeks, padded with the days of the
 * neighbouring months so every row has seven cells.
 */
export function buildMonthWeeks({year, month}: CalendarMonth): CalendarDay[][] {
	const first = new Date(Date.UTC(year, month - 1, 1));
	const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
	const leading = first.getUTCDay();
	const cellCount = Math.ceil((leading + daysInMonth) / 7) * 7;

	const weeks: CalendarDay[][] = [];
	for (let i = 0; i < cellCount; i++) {
		const day = new Date(Date.UTC(year, month - 1, 1 - leading + i));
		const cell: CalendarDay = {
			date: `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`,
			dayOfMonth: day.getUTCDate(),
			inMonth: day.getUTCMonth() === month - 1,
		};
		if (i % 7 === 0) weeks.push([]);
		weeks[weeks.length - 1].push(cell);
	}
	return weeks;
}

/**
 * overdue  – at least one open task on this day is past due
 * due      – open tasks due on this day (today or later)
 * none     – nothing open on this day
 */
export type DayMark = 'overdue' | 'due' | 'none';

export interface DaySummary {
	mark: DayMark;
	count: number;
}

/** Open tasks grouped by due date, with how each day should be marked. */
export function summarizeTaskDays(
	tasks: ReadonlyArray<{dueDate: string}>,
	today: string
): Map<string, DaySummary> {
	const days = new Map<string, DaySummary>();
	for (const task of tasks) {
		const overdue = classifyTask(task, today).timing === 'overdue';
		const current = days.get(task.dueDate) ?? {mark: 'none' as DayMark, count: 0};
		days.set(task.dueDate, {
			mark: overdue || current.mark === 'overdue' ? 'overdue' : 'due',
			count: current.count + 1,
		});
	}
	return days;
}
