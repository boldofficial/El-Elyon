// db/mutations/blood-glucose-logs.ts
//
// Write side of the blood sugar log. Entries are never deleted: an edit
// saves the previous values to blood_glucose_log_revisions in the same batch
// as the update, and a supervisor review is recorded on the row itself.

import {and, eq, isNull} from 'drizzle-orm';
import {db} from '../index';
import {bloodGlucoseLogRevisions, bloodGlucoseLogs, employees, residents, shifts} from '../schema';
import {AccessDeniedError, logAudit, requireCareAccess, residentInScope} from '@/lib/db-helpers';
import {getClerkUser} from '@/lib/clerk';
import {computeOperationalDate} from '@/lib/operational-time';
import {
	AUTHOR_EDIT_WINDOW_MINUTES,
	GlucoseEntryError,
	MAX_BACKDATE_HOURS,
	MAX_FUTURE_MINUTES,
	computeRecheckDueAt,
	isOutOfRange,
	normalizeGlucoseEntry,
	resolveGlucoseThresholds,
	validateCheckedAt,
	type GlucoseStatus,
	type GlucoseThresholds,
} from '@/lib/blood-glucose';
import {getOperationalTimeZone} from '../queries/care';

/** Bad input from the client; the message is safe to show to the user. */
export {GlucoseEntryError as GlucoseLogValidationError};

export class GlucoseLogConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'GlucoseLogConflictError';
	}
}

const MAX_REASON_LENGTH = 500;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

function isSupervisorRole(role: string | null | undefined) {
	const r = (role || '').toLowerCase();
	return r === 'admin' || r === 'supervisor';
}

function isUniqueViolation(error: unknown): boolean {
	const code =
		(error as {code?: string})?.code ?? (error as {cause?: {code?: string}})?.cause?.code;
	return code === '23505';
}

export async function createGlucoseLog(
	clerkUserId: string,
	input: Record<string, unknown> & {residentId: string}
) {
	const userRole = await requireCareAccess(clerkUserId);
	const allowed = await residentInScope({
		clerkUserId,
		userRole,
		residentId: input.residentId,
		auditDetail: 'glucose_logs_create_cross_location',
	});
	if (!allowed) throw new AccessDeniedError('Access denied');

	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, input.residentId),
		columns: {
			id: true,
			location: true,
			glucoseTrackingEnabled: true,
			glucoseCriticalLowMgDl: true,
			glucoseTargetLowMgDl: true,
			glucoseTargetHighMgDl: true,
			glucoseCriticalHighMgDl: true,
		},
	});
	if (!resident) throw new GlucoseEntryError('Resident not found');
	if (!resident.glucoseTrackingEnabled) {
		throw new GlucoseEntryError('Blood sugar tracking is not turned on for this resident');
	}

	const thresholds = resolveGlucoseThresholds(resident);
	const entry = normalizeGlucoseEntry(input, thresholds);
	const now = new Date();
	const checkedAt = validateCheckedAt(input.checkedAt, now);

	// A recheck is tied to the out-of-range reading it follows up.
	let recheckOfId: string | null = null;
	if (input.recheckOfId !== undefined && input.recheckOfId !== null && input.recheckOfId !== '') {
		if (typeof input.recheckOfId !== 'string' || !UUID_RE.test(input.recheckOfId)) {
			throw new GlucoseEntryError('Invalid recheck reference');
		}
		const parent = await db.query.bloodGlucoseLogs.findFirst({
			where: eq(bloodGlucoseLogs.id, input.recheckOfId),
			columns: {id: true, residentId: true, recheckDueAt: true, checkedAt: true},
		});
		if (!parent || parent.residentId !== resident.id) {
			throw new GlucoseEntryError('The reading being rechecked was not found');
		}
		if (!parent.recheckDueAt) {
			throw new GlucoseEntryError('That reading does not need a recheck');
		}
		if (checkedAt.getTime() <= parent.checkedAt.getTime()) {
			throw new GlucoseEntryError('A recheck must be after the original reading');
		}
		recheckOfId = parent.id;
		entry.checkType = 'recheck';
	} else if (entry.checkType === 'recheck') {
		throw new GlucoseEntryError(
			'Use "Log recheck" on the reading you are rechecking so the two stay linked'
		);
	}

	const timeZone = await getOperationalTimeZone();
	const operationalDate = computeOperationalDate(checkedAt, timeZone);

	const openShift = await db.query.shifts.findFirst({
		where: and(eq(shifts.clerkUserId, clerkUserId), isNull(shifts.clockOutTime)),
		columns: {id: true},
		orderBy: (s, {desc}) => [desc(s.clockInTime)],
	});
	const staffNameSnapshot = await resolveStaffName(clerkUserId);

	let created: typeof bloodGlucoseLogs.$inferSelect | undefined;
	try {
		[created] = await db
			.insert(bloodGlucoseLogs)
			.values({
				residentId: resident.id,
				location: resident.location,
				operationalDate,
				checkedAt,
				...entry,
				...thresholdColumns(thresholds),
				recheckDueAt: computeRecheckDueAt(checkedAt, entry.status),
				recheckOfId,
				shiftId: openShift?.id ?? null,
				staffId: clerkUserId,
				staffNameSnapshot,
			})
			.returning();
	} catch (error) {
		if (isUniqueViolation(error)) {
			throw new GlucoseLogConflictError(
				'A recheck has already been logged for that reading. Refresh the page.'
			);
		}
		throw error;
	}
	if (!created) throw new Error('Failed to create blood glucose log');

	await logAudit({
		clerkUserId,
		event: 'CREATE_BLOOD_GLUCOSE_LOG',
		details: `Logged ${entry.checkType} blood sugar check (${entry.status}) for resident ${resident.id} on ${operationalDate}`,
		deviceId: 'system',
		location: resident.location,
	});

	return created;
}

function thresholdColumns(t: GlucoseThresholds) {
	return {
		criticalLowMgDl: t.criticalLow,
		targetLowMgDl: t.low,
		targetHighMgDl: t.high,
		criticalHighMgDl: t.criticalHigh,
	};
}

/** The fields an edit can change, as stored before the edit. */
function editableSnapshot(row: typeof bloodGlucoseLogs.$inferSelect) {
	return {
		checkedAt: row.checkedAt.toISOString(),
		checkType: row.checkType,
		method: row.method,
		refused: row.refused,
		refusalReason: row.refusalReason,
		readingValue: row.readingValue,
		readingUnit: row.readingUnit,
		readingMgDl: row.readingMgDl,
		status: row.status,
		symptoms: row.symptoms,
		actionsTaken: row.actionsTaken,
		notifiedWho: row.notifiedWho,
		insulinGiven: row.insulinGiven,
		insulinType: row.insulinType,
		insulinUnits: row.insulinUnits,
		notes: row.notes,
		reviewedAt: row.reviewedAt?.toISOString() ?? null,
		reviewedByName: row.reviewedByName,
		reviewComment: row.reviewComment,
	};
}

const EDITABLE_KEYS = [
	'checkType',
	'method',
	'refused',
	'refusalReason',
	'readingValue',
	'readingUnit',
	'symptoms',
	'actionsTaken',
	'notifiedWho',
	'insulinGiven',
	'insulinType',
	'insulinUnits',
	'notes',
] as const;

export async function updateGlucoseLog(
	clerkUserId: string,
	logId: string,
	input: Record<string, unknown>
) {
	const userRole = await requireCareAccess(clerkUserId);

	const existing = await db.query.bloodGlucoseLogs.findFirst({
		where: eq(bloodGlucoseLogs.id, logId),
	});
	if (!existing) throw new GlucoseEntryError('Entry not found');

	const allowed = await residentInScope({
		clerkUserId,
		userRole,
		residentId: existing.residentId,
		auditDetail: 'glucose_logs_update_cross_location',
	});
	if (!allowed) throw new AccessDeniedError('Access denied');

	const isAuthorInWindow =
		existing.staffId === clerkUserId &&
		Date.now() - existing.loggedAt.getTime() <= AUTHOR_EDIT_WINDOW_MINUTES * 60_000;
	if (!isSupervisorRole(userRole.role) && !isAuthorInWindow) {
		throw new AccessDeniedError(
			`Only the person who logged it (within ${AUTHOR_EDIT_WINDOW_MINUTES} minutes) or a supervisor can change this entry`
		);
	}

	const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
	if (!reason) throw new GlucoseEntryError('Give a reason for the change');
	if (reason.length > MAX_REASON_LENGTH) throw new GlucoseEntryError('Reason is too long');

	// Merge the patch over the stored values and validate the whole entry
	// against the limits that applied when it was first logged.
	const merged: Record<string, unknown> = {
		...editableSnapshot(existing),
	};
	for (const key of EDITABLE_KEYS) {
		if (input[key] !== undefined) merged[key] = input[key];
	}
	const thresholds: GlucoseThresholds = {
		criticalLow: existing.criticalLowMgDl,
		low: existing.targetLowMgDl,
		high: existing.targetHighMgDl,
		criticalHigh: existing.criticalHighMgDl,
	};
	const entry = normalizeGlucoseEntry(merged, thresholds);

	// The link between a recheck and its reading is fixed once logged.
	if ((existing.recheckOfId !== null) !== (entry.checkType === 'recheck')) {
		throw new GlucoseEntryError(
			existing.recheckOfId ? 'A recheck must stay a recheck' : 'Use "Log recheck" to record a recheck'
		);
	}

	let checkedAt = existing.checkedAt;
	if (input.checkedAt !== undefined && input.checkedAt !== null && input.checkedAt !== '') {
		const next = new Date(String(input.checkedAt));
		if (!Number.isFinite(next.getTime())) throw new GlucoseEntryError('Invalid check time');
		if (next.getTime() !== existing.checkedAt.getTime()) {
			if (next.getTime() > Date.now() + MAX_FUTURE_MINUTES * 60_000) {
				throw new GlucoseEntryError('Check time cannot be in the future');
			}
			if (Math.abs(next.getTime() - existing.checkedAt.getTime()) > MAX_BACKDATE_HOURS * 3_600_000) {
				throw new GlucoseEntryError(
					`Check time can only be moved by up to ${MAX_BACKDATE_HOURS} hours`
				);
			}
			checkedAt = next;
		}
	}
	const operationalDate =
		checkedAt === existing.checkedAt
			? existing.operationalDate
			: computeOperationalDate(checkedAt, await getOperationalTimeZone());

	const editorName = await resolveStaffName(clerkUserId);
	const now = new Date();

	const [, [updated]] = await db.batch([
		db.insert(bloodGlucoseLogRevisions).values({
			logId,
			previous: editableSnapshot(existing),
			reason,
			revisedBy: clerkUserId,
			revisedByName: editorName,
		}),
		db
			.update(bloodGlucoseLogs)
			.set({
				...entry,
				checkedAt,
				operationalDate,
				recheckDueAt: computeRecheckDueAt(checkedAt, entry.status),
				updatedAt: now,
				updatedBy: clerkUserId,
				// A changed record needs a fresh look from a supervisor.
				reviewedAt: null,
				reviewedBy: null,
				reviewedByName: null,
				reviewComment: null,
			})
			.where(eq(bloodGlucoseLogs.id, logId))
			.returning(),
	]);
	if (!updated) throw new Error('Failed to update blood glucose log');

	await logAudit({
		clerkUserId,
		event: 'UPDATE_BLOOD_GLUCOSE_LOG',
		details: `Updated blood sugar log ${logId} for resident ${existing.residentId} (${existing.status} -> ${entry.status})`,
		deviceId: 'system',
		location: existing.location,
	});

	return updated;
}

export async function reviewGlucoseLog(
	clerkUserId: string,
	logId: string,
	input: {comment?: unknown}
) {
	const userRole = await requireCareAccess(clerkUserId);
	if (!isSupervisorRole(userRole.role)) {
		throw new AccessDeniedError('Only supervisors and admins can review entries');
	}

	const existing = await db.query.bloodGlucoseLogs.findFirst({
		where: eq(bloodGlucoseLogs.id, logId),
		columns: {id: true, residentId: true, location: true, status: true},
	});
	if (!existing) throw new GlucoseEntryError('Entry not found');

	const allowed = await residentInScope({
		clerkUserId,
		userRole,
		residentId: existing.residentId,
		auditDetail: 'glucose_logs_review_cross_location',
	});
	if (!allowed) throw new AccessDeniedError('Access denied');

	let comment: string | null = null;
	if (input.comment !== undefined && input.comment !== null) {
		if (typeof input.comment !== 'string') throw new GlucoseEntryError('Comment must be text');
		comment = input.comment.trim() || null;
		if (comment && comment.length > MAX_REASON_LENGTH) {
			throw new GlucoseEntryError('Comment is too long');
		}
	}

	const [updated] = await db
		.update(bloodGlucoseLogs)
		.set({
			reviewedAt: new Date(),
			reviewedBy: clerkUserId,
			reviewedByName: await resolveStaffName(clerkUserId),
			reviewComment: comment,
		})
		.where(eq(bloodGlucoseLogs.id, logId))
		.returning();
	if (!updated) throw new Error('Failed to review blood glucose log');

	await logAudit({
		clerkUserId,
		event: 'REVIEW_BLOOD_GLUCOSE_LOG',
		details: `Reviewed blood sugar log ${logId} (${existing.status as GlucoseStatus}${
			isOutOfRange(existing.status as GlucoseStatus) ? ', out of range' : ''
		}) for resident ${existing.residentId}`,
		deviceId: 'system',
		location: existing.location,
	});

	return updated;
}
