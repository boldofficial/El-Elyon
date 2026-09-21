// lib/custom-log-schedule.ts
//
// Pure scheduling model for admin-defined custom log sheets (carbs per meal,
// BP twice daily, weekly weight, ...). The template's own `schedule` is the
// single determinant of which entries are expected and which are flagged as
// missing — there is no per-template code anywhere else.
//
// Everything here is a pure function of its inputs so it can be unit-tested
// without a database, mirroring `waterTemperatureEntryModel.ts`.

/** A wall-clock time in the organization's operational timezone, "HH:MM". */
export type ClockTime = `${number}${number}:${number}${number}`;

export interface ScheduleSlot {
	/** Stable key stored on each entry, e.g. 'breakfast', 'morning'. */
	key: string;
	label: string;
	/** Window in which the slot is expected to be logged (inclusive start). */
	from: ClockTime;
	/** Window end (inclusive). Must be >= `from`; overnight windows are not supported in v1. */
	to: ClockTime;
}

export interface LogSchedule {
	/** 'day' = every slot expected each operational date; 'week' = each slot expected once per ISO week. */
	period: 'day' | 'week';
	slots: ScheduleSlot[];
}

export type SlotStatus =
	| 'logged' // an entry exists for this slot in the current period
	| 'upcoming' // window has not opened yet
	| 'open' // window is open and nothing logged yet
	| 'missed'; // window has closed and nothing was logged

export interface SlotState {
	slot: ScheduleSlot;
	status: SlotStatus;
}

export interface DeriveSlotStatesInput {
	schedule: LogSchedule;
	/** Slot keys that already have a non-voided entry in the current period. */
	loggedSlotKeys: ReadonlySet<string>;
	/** Current wall-clock time in the operational timezone. */
	now: ClockTime;
}

/** Minutes since midnight, for comparing ClockTimes. */
export function clockTimeToMinutes(time: ClockTime): number {
	const [h, m] = time.split(':').map(Number);
	return h * 60 + m;
}

/**
 * Classifies every slot in the schedule for the current period, in schedule
 * order. The policy is deliberately the simplest defensible one:
 *  - logged wins regardless of when it was logged (an early breakfast entry
 *    still counts);
 *  - before the window opens the slot is 'upcoming' and stays off the feed;
 *  - inside the window it is 'open';
 *  - after the window closes with no entry it is 'missed' and STAYS on the
 *    feed for the rest of the period so staff can still log it (this is the
 *    one care log where late entry is intended -- see late-shift-log-entry).
 */
export function deriveSlotStates(input: DeriveSlotStatesInput): SlotState[] {
	const nowMinutes = clockTimeToMinutes(input.now);
	return input.schedule.slots.map((slot) => {
		if (input.loggedSlotKeys.has(slot.key)) return {slot, status: 'logged'};
		if (nowMinutes < clockTimeToMinutes(slot.from)) return {slot, status: 'upcoming'};
		if (nowMinutes <= clockTimeToMinutes(slot.to)) return {slot, status: 'open'};
		return {slot, status: 'missed'};
	});
}

/** "HH:MM" wall-clock time for an instant in the given IANA timezone. */
export function clockTimeInTimeZone(instant: Date, timeZone: string): ClockTime {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23',
	}).formatToParts(instant);
	const hour = parts.find((part) => part.type === 'hour')?.value ?? '00';
	const minute = parts.find((part) => part.type === 'minute')?.value ?? '00';
	return `${hour}:${minute}` as ClockTime;
}

/**
 * Convenience used by the dashboard feed: only the slots that need attention
 * right now, in schedule order.
 */
export function deriveSlotsNeedingAttention(
	input: DeriveSlotStatesInput
): SlotState[] {
	return deriveSlotStates(input).filter(
		(state) => state.status === 'open' || state.status === 'missed'
	);
}
