// src/app/api/supervisor/missed-shifts/handler.ts
//
// GET:  the staff and houses the caller may record a missed shift for.
// POST: record a shift a worker forgot to clock in for (lib/missed-shift.ts
//       has the rules). Factored out of route.ts so the permission and window
//       rules are tested without Clerk or a database.

import {NextResponse} from 'next/server';
import {computeOperationalDate} from '@/lib/operational-time';
import {
	MISSED_SHIFT_DEVICE_ID,
	missedShiftAccessError,
	missedShiftOptions,
	missedShiftTimes,
	missedShiftWindowError,
	overlapsExistingShift,
	parseMissedShiftInput,
	type MissedShiftPerson,
	type ShiftSpan,
} from '@/lib/missed-shift';
import type {ShiftSlot} from '@/lib/water-temperature';

type RoleDoc = {role: string | null; locations: string[] | null} | null | undefined;

export type NewMissedShift = {
	clerkUserId: string;
	location: string;
	locationId: string;
	shiftSlot: ShiftSlot;
	operationalDate: string;
	operationalTimeZoneSnapshot: string;
	clockInTime: Date;
	clockOutTime: Date;
	deviceId: string;
	enteredBy: string;
	enteredAt: Date;
};

export type MissedShiftDependencies = {
	getUserId: () => Promise<string | null>;
	/** Role and assigned houses (role row plus employee row), or null for no role. */
	getRole: (clerkUserId: string) => Promise<RoleDoc>;
	listActiveLocationNames: () => Promise<string[]>;
	listPeople: () => Promise<(MissedShiftPerson & {name: string})[]>;
	/** The active house with exactly this name, or null (missing, inactive, ambiguous). */
	resolveLocation: (name: string) => Promise<{id: string; name: string} | null>;
	getTimeZone: () => Promise<string>;
	/** The worker's shifts that start before `to` and are open or end after `from`. */
	findShiftsBetween: (clerkUserId: string, from: Date, to: Date) => Promise<ShiftSpan[]>;
	insertShift: (shift: NewMissedShift) => Promise<{id: string}>;
	audit: (event: {actorId: string; shift: NewMissedShift}) => Promise<void>;
	now?: () => Date;
};

const privateNoStore = {'Cache-Control': 'private, no-store'};

function error(status: number, message: string) {
	return NextResponse.json({error: message}, {status});
}

function person(clerkUserId: string, role: RoleDoc): MissedShiftPerson {
	return {clerkUserId, role: role?.role ?? null, locations: role?.locations ?? []};
}

function isSupervisorOrAdmin(role: RoleDoc) {
	const name = role?.role?.toLowerCase();
	return name === 'admin' || name === 'supervisor';
}

export function createMissedShiftHandlers(deps: MissedShiftDependencies) {
	const now = deps.now ?? (() => new Date());

	async function GET() {
		const userId = await deps.getUserId();
		if (!userId) return error(401, 'Unauthorized');

		const role = await deps.getRole(userId);
		if (!isSupervisorOrAdmin(role)) {
			return error(403, 'Only supervisors and admins can record missed shifts');
		}

		const [locations, people] = await Promise.all([
			deps.listActiveLocationNames(),
			deps.listPeople(),
		]);
		return NextResponse.json(missedShiftOptions(person(userId, role), locations, people), {
			headers: privateNoStore,
		});
	}

	async function POST(request: Request) {
		try {
			return await record(request);
		} catch (cause) {
			console.error('Error recording missed shift:', cause);
			return error(500, 'Could not record the shift. Please try again.');
		}
	}

	async function record(request: Request) {
		const userId = await deps.getUserId();
		if (!userId) return error(401, 'Unauthorized');

		const actorRole = await deps.getRole(userId);
		if (!isSupervisorOrAdmin(actorRole)) {
			return error(403, 'Only supervisors and admins can record missed shifts');
		}

		const parsed = parseMissedShiftInput(await request.json().catch(() => null));
		if (!parsed.ok) return error(400, parsed.error);
		const input = parsed.value;

		const staffRole = await deps.getRole(input.staffId);
		if (!staffRole) return error(404, 'Staff member not found');

		const location = await deps.resolveLocation(input.location);
		if (!location) return error(400, 'That house is not an active location');

		const accessError = missedShiftAccessError(
			person(userId, actorRole),
			person(input.staffId, staffRole),
			location.name
		);
		if (accessError) return error(403, accessError);

		const timeZone = await deps.getTimeZone();
		const current = now();
		const times = missedShiftTimes(input, timeZone);
		const windowError = missedShiftWindowError(
			input.date,
			times,
			computeOperationalDate(current, timeZone),
			current
		);
		if (windowError) return error(400, windowError);

		const existing = await deps.findShiftsBetween(
			input.staffId,
			times.clockInTime,
			times.clockOutTime
		);
		if (overlapsExistingShift(times, existing, current)) {
			return error(409, 'This staff member already has a shift during those times');
		}

		const shift: NewMissedShift = {
			clerkUserId: input.staffId,
			location: location.name,
			locationId: location.id,
			shiftSlot: input.shiftSlot,
			// Same rule as clock-in: a shift belongs to the day it started.
			operationalDate: computeOperationalDate(times.clockInTime, timeZone),
			operationalTimeZoneSnapshot: timeZone,
			clockInTime: times.clockInTime,
			clockOutTime: times.clockOutTime,
			deviceId: MISSED_SHIFT_DEVICE_ID,
			enteredBy: userId,
			enteredAt: current,
		};
		const {id} = await deps.insertShift(shift);
		await deps.audit({actorId: userId, shift});

		return NextResponse.json({id}, {status: 201});
	}

	return {GET, POST};
}
