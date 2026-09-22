// db/queries/carb-logs.ts
//
// Read side of the per-meal carbohydrate log. Every entry point takes the
// caller's Clerk id and scopes to residents at their locations via the same
// `residentInScope` gate the incident routes use.

import {and, desc, eq, gte, inArray, lte} from 'drizzle-orm';
import {db} from '../index';
import {carbLogs, residents} from '../schema';
import {requireCareAccess, residentInScope, AccessDeniedError} from '@/lib/db-helpers';
import {computeOperationalDate} from '@/lib/operational-time';
import {
	clockTimeInTimeZone,
	deriveSlotStates,
	deriveSlotsNeedingAttention,
	type SlotState,
} from '@/lib/custom-log-schedule';
import {CARB_LOG_SCHEDULE, type MealSlot} from '@/lib/carb-log';
import {
	summarizeCarbLogDays,
	type CarbLogDayRow,
} from '@/lib/carb-log-summary';
import {getOperationalTimeZone} from './care';

export type CarbLogDto = {
	id: string;
	residentId: string;
	location: string;
	operationalDate: string;
	mealSlot: MealSlot;
	carbsGrams: number;
	foodDescription: string | null;
	notes: string | null;
	shiftId: string | null;
	staffId: string;
	staffNameSnapshot: string;
	loggedAt: string;
	updatedAt: string | null;
	updatedBy: string | null;
};

export type CarbLogDayStatus = {
	operationalDate: string;
	slots: SlotState[];
};

function toDto(row: typeof carbLogs.$inferSelect): CarbLogDto {
	return {
		id: row.id,
		residentId: row.residentId,
		location: row.location,
		operationalDate: row.operationalDate,
		mealSlot: row.mealSlot as MealSlot,
		carbsGrams: row.carbsGrams,
		foodDescription: row.foodDescription,
		notes: row.notes,
		shiftId: row.shiftId,
		staffId: row.staffId,
		staffNameSnapshot: row.staffNameSnapshot,
		loggedAt: row.loggedAt.toISOString(),
		updatedAt: row.updatedAt?.toISOString() ?? null,
		updatedBy: row.updatedBy,
	};
}

async function assertResidentReadable(clerkUserId: string, residentId: string) {
	const userRole = await requireCareAccess(clerkUserId);
	const allowed = await residentInScope({
		clerkUserId,
		userRole,
		residentId,
		auditDetail: 'carb_logs_cross_location',
	});
	if (!allowed) throw new AccessDeniedError('Access denied');
	return userRole;
}

/**
 * Entries for one resident in an inclusive operational-date range, newest
 * first. Defaults to the last 14 days.
 */
export async function getCarbLogsForResident(
	clerkUserId: string,
	residentId: string,
	range?: {from?: string; to?: string}
): Promise<CarbLogDto[]> {
	await assertResidentReadable(clerkUserId, residentId);

	const timeZone = await getOperationalTimeZone();
	const today = computeOperationalDate(new Date(), timeZone);
	const to = range?.to ?? today;
	const from = range?.from ?? shiftDate(today, -13);

	const rows = await db.query.carbLogs.findMany({
		where: and(
			eq(carbLogs.residentId, residentId),
			gte(carbLogs.operationalDate, from),
			lte(carbLogs.operationalDate, to)
		),
		orderBy: [desc(carbLogs.operationalDate), desc(carbLogs.loggedAt)],
	});
	return rows.map(toDto);
}

/** Today's slot states for one resident (drives the entry screen). */
export async function getCarbLogDayStatus(
	clerkUserId: string,
	residentId: string
): Promise<CarbLogDayStatus> {
	await assertResidentReadable(clerkUserId, residentId);

	const timeZone = await getOperationalTimeZone();
	const now = new Date();
	const operationalDate = computeOperationalDate(now, timeZone);
	const logged = await loggedSlotKeysByResident([residentId], operationalDate);

	return {
		operationalDate,
		slots: deriveSlotStates({
			schedule: CARB_LOG_SCHEDULE,
			loggedSlotKeys: logged.get(residentId) ?? new Set(),
			now: clockTimeInTimeZone(now, timeZone),
		}),
	};
}

export type CarbLogReminder = {
	residentId: string;
	residentName: string;
	location: string;
	operationalDate: string;
	/** Main-meal slots that are open or missed right now, in schedule order. */
	slots: SlotState[];
};

/**
 * Dashboard feed: residents with carb tracking on at the caller's locations
 * (all locations for admins) that still have an open or missed main meal
 * today. Non-blocking by design -- it is a line in the feed, never a banner.
 */
export async function getCarbLogRemindersForUser(
	clerkUserId: string
): Promise<CarbLogReminder[]> {
	const userRole = await requireCareAccess(clerkUserId);
	const isAdmin = userRole.role === 'admin';
	const locationNames = userRole.locations ?? [];
	if (!isAdmin && locationNames.length === 0) return [];

	const tracked = await db.query.residents.findMany({
		where: and(
			eq(residents.carbTrackingEnabled, true),
			eq(residents.status, 'active'),
			isAdmin ? undefined : inArray(residents.location, locationNames)
		),
		columns: {id: true, name: true, location: true},
		orderBy: [residents.location, residents.name],
	});
	if (tracked.length === 0) return [];

	const timeZone = await getOperationalTimeZone();
	const now = new Date();
	const operationalDate = computeOperationalDate(now, timeZone);
	const nowClock = clockTimeInTimeZone(now, timeZone);
	const logged = await loggedSlotKeysByResident(
		tracked.map((r) => r.id),
		operationalDate
	);

	const reminders: CarbLogReminder[] = [];
	for (const resident of tracked) {
		const slots = deriveSlotsNeedingAttention({
			schedule: CARB_LOG_SCHEDULE,
			loggedSlotKeys: logged.get(resident.id) ?? new Set(),
			now: nowClock,
		});
		if (slots.length === 0) continue;
		reminders.push({
			residentId: resident.id,
			residentName: resident.name,
			location: resident.location,
			operationalDate,
			slots,
		});
	}
	return reminders;
}

export type CarbLogScopeFilters = {
	/** Location NAME, as stored on residents/carb_logs. */
	location?: string;
	residentId?: string;
	from?: string;
	to?: string;
};

export type CarbLogScopeResult = {
	from: string;
	to: string;
	rows: CarbLogDayRow[];
};

/**
 * Oversight read: carb entries across residents, grouped into resident-day
 * rows. Deliberately a SEPARATE function from getCarbLogsForResident rather
 * than that query with an optional filter -- this one gates on the caller's
 * location set, while the per-resident one fails closed on a single id via
 * residentInScope. Collapsing them is how an optional param turns into an
 * IDOR (see the note on residentInScope in lib/db-helpers.ts).
 *
 * Admins see every location; everyone else sees only their assigned ones,
 * and a `location` filter outside that set is denied rather than silently
 * widened or emptied.
 */
export async function getCarbLogsForScope(
	clerkUserId: string,
	filters: CarbLogScopeFilters = {}
): Promise<CarbLogScopeResult> {
	const userRole = await requireCareAccess(clerkUserId);
	const isAdmin = userRole.role === 'admin';
	const authorizedLocations = userRole.locations ?? [];

	const timeZone = await getOperationalTimeZone();
	const today = computeOperationalDate(new Date(), timeZone);
	const to = filters.to ?? today;
	const from = filters.from ?? shiftDate(to, -13);

	// A resident filter still goes through the per-resident gate, so a
	// client cannot name someone outside their locations here either.
	if (filters.residentId) {
		const allowed = await residentInScope({
			clerkUserId,
			userRole,
			residentId: filters.residentId,
			auditDetail: 'carb_logs_scope_cross_location',
		});
		if (!allowed) throw new AccessDeniedError('Access denied');
	}

	const conditions = [
		gte(carbLogs.operationalDate, from),
		lte(carbLogs.operationalDate, to),
	];

	if (filters.residentId) {
		conditions.push(eq(carbLogs.residentId, filters.residentId));
	}

	if (!isAdmin) {
		if (authorizedLocations.length === 0) return {from, to, rows: []};
		if (filters.location) {
			if (!authorizedLocations.includes(filters.location)) {
				throw new AccessDeniedError('Access denied');
			}
			conditions.push(eq(carbLogs.location, filters.location));
		} else {
			conditions.push(inArray(carbLogs.location, authorizedLocations));
		}
	} else if (filters.location) {
		conditions.push(eq(carbLogs.location, filters.location));
	}

	const rows = await db
		.select({
			residentId: carbLogs.residentId,
			residentName: residents.name,
			location: carbLogs.location,
			operationalDate: carbLogs.operationalDate,
			mealSlot: carbLogs.mealSlot,
			carbsGrams: carbLogs.carbsGrams,
		})
		.from(carbLogs)
		.innerJoin(residents, eq(residents.id, carbLogs.residentId))
		.where(and(...conditions));

	return {
		from,
		to,
		rows: summarizeCarbLogDays(
			rows.map((row) => ({...row, mealSlot: row.mealSlot as MealSlot}))
		),
	};
}

async function loggedSlotKeysByResident(
	residentIds: string[],
	operationalDate: string
): Promise<Map<string, Set<string>>> {
	const rows = await db
		.select({residentId: carbLogs.residentId, mealSlot: carbLogs.mealSlot})
		.from(carbLogs)
		.where(
			and(
				inArray(carbLogs.residentId, residentIds),
				eq(carbLogs.operationalDate, operationalDate)
			)
		);
	const byResident = new Map<string, Set<string>>();
	for (const row of rows) {
		const set = byResident.get(row.residentId) ?? new Set<string>();
		set.add(row.mealSlot);
		byResident.set(row.residentId, set);
	}
	return byResident;
}

/** Adds `days` (may be negative) to a YYYY-MM-DD string without timezone drift. */
export function shiftDate(isoDate: string, days: number): string {
	const [y, m, d] = isoDate.split('-').map(Number);
	const shifted = new Date(Date.UTC(y, m - 1, d + days));
	return shifted.toISOString().slice(0, 10);
}
