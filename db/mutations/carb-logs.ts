// db/mutations/carb-logs.ts
//
// Write side of the per-meal carbohydrate log.

import {and, eq, isNull} from 'drizzle-orm';
import {db} from '../index';
import {carbLogs, employees, residents, shifts} from '../schema';
import {
	AccessDeniedError,
	logAudit,
	requireCareAccess,
	residentInScope,
} from '@/lib/db-helpers';
import {getClerkUser} from '@/lib/clerk';
import {computeOperationalDate} from '@/lib/operational-time';
import {
	CARBS_GRAMS_MAX,
	CARBS_GRAMS_MIN,
	isMealSlot,
	isValidCarbsGrams,
	type MealSlot,
} from '@/lib/carb-log';
import {getOperationalTimeZone} from '../queries/care';
import {shiftDate} from '../queries/carb-logs';

export class CarbLogValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CarbLogValidationError';
	}
}

export class CarbLogConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CarbLogConflictError';
	}
}

/** Same rule as incident reports: author may edit for 24h, supervisors/admins always. */
const AUTHOR_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

const MAX_TEXT_LENGTH = 2000;

function cleanText(value: unknown, field: string): string | null {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') {
		throw new CarbLogValidationError(`${field} must be text`);
	}
	const trimmed = value.trim();
	if (trimmed.length > MAX_TEXT_LENGTH) {
		throw new CarbLogValidationError(`${field} is too long`);
	}
	return trimmed || null;
}

function validateCarbs(value: unknown): number {
	if (!isValidCarbsGrams(value)) {
		throw new CarbLogValidationError(
			`Carbs must be a whole number between ${CARBS_GRAMS_MIN} and ${CARBS_GRAMS_MAX} grams`
		);
	}
	return value;
}

async function resolveStaffName(clerkUserId: string): Promise<string> {
	const employee = await db.query.employees.findFirst({
		where: eq(employees.clerkUserId, clerkUserId),
		columns: {name: true},
	});
	const name = employee?.name?.trim();
	if (name) return name;
	const clerkUser = await getClerkUser(clerkUserId);
	return clerkUser?.name || 'Unknown';
}

export async function createCarbLog(
	clerkUserId: string,
	input: {
		residentId: string;
		mealSlot: unknown;
		carbsGrams: unknown;
		foodDescription?: unknown;
		notes?: unknown;
		/** Optional; must be today or yesterday (operational). Defaults to today. */
		operationalDate?: unknown;
	}
) {
	const userRole = await requireCareAccess(clerkUserId);
	const allowed = await residentInScope({
		clerkUserId,
		userRole,
		residentId: input.residentId,
		auditDetail: 'carb_logs_create_cross_location',
	});
	if (!allowed) throw new AccessDeniedError('Access denied');

	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, input.residentId),
		columns: {id: true, location: true, carbTrackingEnabled: true},
	});
	if (!resident) throw new CarbLogValidationError('Resident not found');
	if (!resident.carbTrackingEnabled) {
		throw new CarbLogValidationError('Carb tracking is not enabled for this resident');
	}

	if (!isMealSlot(input.mealSlot)) {
		throw new CarbLogValidationError('Invalid meal');
	}
	const mealSlot: MealSlot = input.mealSlot;
	const carbsGrams = validateCarbs(input.carbsGrams);
	const foodDescription = cleanText(input.foodDescription, 'Food description');
	const notes = cleanText(input.notes, 'Notes');

	const timeZone = await getOperationalTimeZone();
	const today = computeOperationalDate(new Date(), timeZone);
	let operationalDate = today;
	if (input.operationalDate !== undefined && input.operationalDate !== null) {
		if (
			typeof input.operationalDate !== 'string' ||
			!/^\d{4}-\d{2}-\d{2}$/.test(input.operationalDate)
		) {
			throw new CarbLogValidationError('Invalid date');
		}
		// Late entry is allowed for the previous operational day only (covers
		// the overnight shift logging a late dinner after midnight).
		if (
			input.operationalDate !== today &&
			input.operationalDate !== shiftDate(today, -1)
		) {
			throw new CarbLogValidationError('Entries can only be logged for today or yesterday');
		}
		operationalDate = input.operationalDate;
	}

	// Attach the author's open shift when there is one; admins/supervisors
	// logging without a shift are still allowed.
	const openShift = await db.query.shifts.findFirst({
		where: and(eq(shifts.clerkUserId, clerkUserId), isNull(shifts.clockOutTime)),
		columns: {id: true},
		orderBy: (s, {desc}) => [desc(s.clockInTime)],
	});

	const staffNameSnapshot = await resolveStaffName(clerkUserId);

	let created: typeof carbLogs.$inferSelect | undefined;
	try {
		[created] = await db
			.insert(carbLogs)
			.values({
				residentId: resident.id,
				location: resident.location,
				operationalDate,
				mealSlot,
				carbsGrams,
				foodDescription,
				notes,
				shiftId: openShift?.id ?? null,
				staffId: clerkUserId,
				staffNameSnapshot,
			})
			.returning();
	} catch (error: unknown) {
		// Partial unique index: one breakfast/lunch/dinner per resident per day.
		if (isUniqueViolation(error)) {
			throw new CarbLogConflictError(
				`${mealSlot} has already been logged for ${operationalDate}. Edit the existing entry instead.`
			);
		}
		throw error;
	}
	if (!created) throw new Error('Failed to create carb log');

	await logAudit({
		clerkUserId,
		event: 'CREATE_CARB_LOG',
		details: `Logged ${mealSlot} carbs (${carbsGrams}g) for resident ${resident.id} on ${operationalDate}`,
		deviceId: 'system',
		location: resident.location,
	});

	return created;
}

export async function updateCarbLog(
	clerkUserId: string,
	logId: string,
	input: {carbsGrams?: unknown; foodDescription?: unknown; notes?: unknown}
) {
	const userRole = await requireCareAccess(clerkUserId);

	const existing = await db.query.carbLogs.findFirst({
		where: eq(carbLogs.id, logId),
	});
	if (!existing) throw new CarbLogValidationError('Entry not found');

	const allowed = await residentInScope({
		clerkUserId,
		userRole,
		residentId: existing.residentId,
		auditDetail: 'carb_logs_update_cross_location',
	});
	if (!allowed) throw new AccessDeniedError('Access denied');

	const isSupervisorOrAdmin =
		userRole.role === 'admin' || userRole.role === 'supervisor';
	const isAuthorInWindow =
		existing.staffId === clerkUserId &&
		Date.now() - existing.loggedAt.getTime() <= AUTHOR_EDIT_WINDOW_MS;
	if (!isSupervisorOrAdmin && !isAuthorInWindow) {
		throw new AccessDeniedError(
			'Only the author (within 24 hours) or a supervisor can edit this entry'
		);
	}

	const patch: Partial<typeof carbLogs.$inferInsert> = {
		updatedAt: new Date(),
		updatedBy: clerkUserId,
	};
	if (input.carbsGrams !== undefined) patch.carbsGrams = validateCarbs(input.carbsGrams);
	if (input.foodDescription !== undefined) {
		patch.foodDescription = cleanText(input.foodDescription, 'Food description');
	}
	if (input.notes !== undefined) patch.notes = cleanText(input.notes, 'Notes');

	const [updated] = await db
		.update(carbLogs)
		.set(patch)
		.where(eq(carbLogs.id, logId))
		.returning();
	if (!updated) throw new Error('Failed to update carb log');

	await logAudit({
		clerkUserId,
		event: 'UPDATE_CARB_LOG',
		details: `Updated ${existing.mealSlot} carb log ${logId} for resident ${existing.residentId} (${existing.operationalDate})`,
		deviceId: 'system',
		location: existing.location,
	});

	return updated;
}

function isUniqueViolation(error: unknown): boolean {
	const code = (error as {code?: string; cause?: {code?: string}})?.code
		?? (error as {cause?: {code?: string}})?.cause?.code;
	return code === '23505';
}
