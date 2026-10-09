// lib/missed-shift.ts
//
// Recording a shift a worker forgot to clock in for. Supervisors and admins
// enter it after the fact; the shift is saved already clocked out and marked
// with who entered it and when (shifts.enteredBy / enteredAt), so it is never
// mistaken for a real clock-in. A late care log for that day can then link to
// it (see src/app/api/care/create-log/route.ts).
//
// Rules (decided 2026-10-09):
// - Admins, and supervisors at their own houses. No one records their own
//   shift, and only an admin records an admin's.
// - The worker must be assigned to the house.
// - The shift's day can be today or up to MISSED_SHIFT_MAX_DAYS back, and it
//   must already be over.
// - No reason is asked for: the reason is that it was missed.
// - It may not overlap another shift of the same worker.
//
// Kept free of Clerk and the database so the rules are tested directly.

import {localDateTimeUtc} from '@/lib/care-log-report';
import {daysBetween, isCalendarDate, shiftDate} from '@/lib/care-log-policy';
import {SHIFT_SLOTS, type ShiftSlot} from '@/lib/water-temperature';

/** How many days back a missed shift may be recorded (matches late care logs). */
export const MISSED_SHIFT_MAX_DAYS = 14;

/** Marks the device column of a recorded shift, next to the real kiosk/browser ids. */
export const MISSED_SHIFT_DEVICE_ID = 'missed-shift-entry';

export type MissedShiftInput = {
	staffId: string;
	location: string;
	shiftSlot: ShiftSlot;
	/** The shift's day (YYYY-MM-DD), the day it started. */
	date: string;
	/** Wall-clock HH:MM in the organization's timezone. */
	clockIn: string;
	/** Wall-clock HH:MM; at or before clockIn means the next morning. */
	clockOut: string;
};

export type MissedShiftPerson = {
	clerkUserId: string;
	role: string | null;
	locations: string[];
};

export type ShiftSpan = {clockInTime: Date; clockOutTime: Date | null};

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function nonEmptyString(value: unknown): value is string {
	return typeof value === 'string' && value.trim().length > 0;
}

export function parseMissedShiftInput(
	body: unknown
): {ok: true; value: MissedShiftInput} | {ok: false; error: string} {
	const input = (body ?? {}) as Record<string, unknown>;
	if (!nonEmptyString(input.staffId)) return {ok: false, error: 'Choose the staff member'};
	if (!nonEmptyString(input.location)) return {ok: false, error: 'Choose the house'};
	const shiftSlot = Number(input.shiftSlot);
	if (!(SHIFT_SLOTS as readonly number[]).includes(shiftSlot)) {
		return {ok: false, error: 'Choose the shift (1st, 2nd, or 3rd)'};
	}
	if (!isCalendarDate(input.date)) return {ok: false, error: 'Choose the day of the shift'};
	if (typeof input.clockIn !== 'string' || !TIME.test(input.clockIn)) {
		return {ok: false, error: 'Enter the clock-in time'};
	}
	if (typeof input.clockOut !== 'string' || !TIME.test(input.clockOut)) {
		return {ok: false, error: 'Enter the clock-out time'};
	}
	if (input.clockIn === input.clockOut) {
		return {ok: false, error: 'Clock-out time must be different from clock-in time'};
	}
	return {
		ok: true,
		value: {
			staffId: input.staffId.trim(),
			location: input.location.trim(),
			shiftSlot: shiftSlot as ShiftSlot,
			date: input.date,
			clockIn: input.clockIn,
			clockOut: input.clockOut,
		},
	};
}

/** The shift's real instants. A clock-out at or before the clock-in time is the next day. */
export function missedShiftTimes(
	input: Pick<MissedShiftInput, 'date' | 'clockIn' | 'clockOut'>,
	timeZone: string
): {clockInTime: Date; clockOutTime: Date} {
	const outDate = input.clockOut <= input.clockIn ? shiftDate(input.date, 1) : input.date;
	return {
		clockInTime: localDateTimeUtc(input.date, input.clockIn, timeZone),
		clockOutTime: localDateTimeUtc(outDate, input.clockOut, timeZone),
	};
}

/**
 * Null when `actor` may record a shift for `staff` at `location`, otherwise
 * the message to show. `actor` and `staff` carry their role and assigned houses.
 */
export function missedShiftAccessError(
	actor: MissedShiftPerson,
	staff: MissedShiftPerson,
	location: string
): string | null {
	const actorRole = actor.role?.toLowerCase();
	if (actorRole !== 'admin' && actorRole !== 'supervisor') {
		return 'Only supervisors and admins can record missed shifts';
	}
	if (staff.clerkUserId === actor.clerkUserId) {
		return 'Ask another supervisor or an admin to record your own missed shift';
	}
	if (actorRole !== 'admin') {
		if (staff.role?.toLowerCase() === 'admin') {
			return "Only an admin can record an admin's shift";
		}
		if (!actor.locations.includes(location)) {
			return 'You can only record shifts at your own houses';
		}
	}
	if (!staff.locations.includes(location)) {
		return 'This staff member is not assigned to that house';
	}
	return null;
}

/**
 * Null when the shift's day and times are allowed, otherwise the message.
 * `today` is today's date in the organization's timezone.
 */
export function missedShiftWindowError(
	date: string,
	times: {clockOutTime: Date},
	today: string,
	now: Date
): string | null {
	const daysBack = daysBetween(date, today);
	if (daysBack < 0) return "A missed shift can't be on a future day";
	if (daysBack > MISSED_SHIFT_MAX_DAYS) {
		return `Missed shifts can only be recorded up to ${MISSED_SHIFT_MAX_DAYS} days back`;
	}
	if (times.clockOutTime.getTime() > now.getTime()) {
		return "That shift hasn't ended yet. Record it after the clock-out time.";
	}
	return null;
}

/** True when the new shift overlaps any of the worker's shifts; an open shift runs until `now`. */
export function overlapsExistingShift(
	times: {clockInTime: Date; clockOutTime: Date},
	existing: ShiftSpan[],
	now: Date
): boolean {
	return existing.some(
		(shift) =>
			shift.clockInTime.getTime() < times.clockOutTime.getTime() &&
			(shift.clockOutTime ?? now).getTime() > times.clockInTime.getTime()
	);
}

/**
 * What the form offers `actor`: the houses they can record at, and the staff
 * and supervisors assigned to them (never the actor, never admins), each with
 * their houses narrowed to those.
 */
export function missedShiftOptions(
	actor: MissedShiftPerson,
	activeLocations: string[],
	people: (MissedShiftPerson & {name: string})[]
): {locations: string[]; staff: {id: string; name: string; locations: string[]}[]} {
	const isAdmin = actor.role?.toLowerCase() === 'admin';
	const locations = activeLocations
		.filter((name) => isAdmin || actor.locations.includes(name))
		.sort((a, b) => a.localeCompare(b));

	const staff = people
		.filter((person) => {
			const role = person.role?.toLowerCase();
			return person.clerkUserId !== actor.clerkUserId && (role === 'staff' || role === 'supervisor');
		})
		.map((person) => ({
			id: person.clerkUserId,
			name: person.name,
			locations: locations.filter((name) => person.locations.includes(name)),
		}))
		.filter((person) => person.locations.length > 0)
		.sort((a, b) => a.name.localeCompare(b.name));

	return {locations, staff};
}
