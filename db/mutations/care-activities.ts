import {db} from '../index';
import {residentLogActivities, residentLogs, residents} from '../schema';
import {eq} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';
import {logAudit} from './audit';
import {InferSelectModel} from 'drizzle-orm';

type ResidentLogActivitySelect = InferSelectModel<typeof residentLogActivities>;
type ResidentLogActivityInsert = typeof residentLogActivities.$inferInsert;

export async function createResidentLogActivity(
	clerkUserId: string,
	data: {
		logId: string;
		activityType: string;
		completed?: boolean;
		notes?: string;
	}
) {
	await requireCareAccess(clerkUserId);

	const residentLog = await db.query.residentLogs.findFirst({
		where: eq(residentLogs.id, data.logId),
	});

	if (!residentLog) {
		throw new Error('Resident log not found');
	}

	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, residentLog.residentId),
	});

	if (!resident) {
		throw new Error('Resident not found for log');
	}


	const [newActivity] = await db
		.insert(residentLogActivities)
		.values({
			...data,
			completed: data.completed ?? false,
			timestamp: new Date(),
		})
		.returning();

	if (!newActivity) {
		throw new Error('Failed to create resident log activity');
	}

	await logAudit({
		clerkUserId,
		event: 'create_resident_log_activity',
		details: `logId=${data.logId}, activityType=${data.activityType}`,
		deviceId: 'system',
		location: resident.location, // Assuming resident has location
	});

	return newActivity;
}

export async function updateResidentLogActivity(
	clerkUserId: string,
	activityId: string,
	data: Partial<ResidentLogActivityInsert>
) {
	await requireCareAccess(clerkUserId);

	const existingActivity = await db.query.residentLogActivities.findFirst({
		where: eq(residentLogActivities.id, activityId),
	});

	if (!existingActivity) {
		throw new Error('Resident log activity not found');
	}

	const residentLog = await db.query.residentLogs.findFirst({
		where: eq(residentLogs.id, existingActivity.logId),
	});
	const resident = residentLog
		? await db.query.residents.findFirst({where: eq(residents.id, residentLog.residentId)})
		: undefined;

	const [updatedActivity] = await db
		.update(residentLogActivities)
		.set({
			...data,
			timestamp: new Date(), // Update timestamp on modification
		})
		.where(eq(residentLogActivities.id, activityId))
		.returning();

	if (!updatedActivity) {
		throw new Error('Failed to update resident log activity');
	}

	await logAudit({
		clerkUserId,
		event: 'update_resident_log_activity',
		details: `activityId=${activityId}, logId=${existingActivity.logId}`,
		deviceId: 'system',
		location: resident?.location || '',
	});

	return updatedActivity;
}

export async function toggleResidentLogActivityCompletion(
	clerkUserId: string,
	activityId: string,
	completed: boolean
) {
	await requireCareAccess(clerkUserId);

	const existingActivity = await db.query.residentLogActivities.findFirst({
		where: eq(residentLogActivities.id, activityId),
	});

	if (!existingActivity) {
		throw new Error('Resident log activity not found');
	}

	const residentLog = await db.query.residentLogs.findFirst({
		where: eq(residentLogs.id, existingActivity.logId),
	});
	const resident = residentLog
		? await db.query.residents.findFirst({where: eq(residents.id, residentLog.residentId)})
		: undefined;

	const [updatedActivity] = await db
		.update(residentLogActivities)
		.set({
			completed: completed,
			timestamp: new Date(),
		})
		.where(eq(residentLogActivities.id, activityId))
		.returning();

	if (!updatedActivity) {
		throw new Error('Failed to toggle resident log activity completion');
	}

	await logAudit({
		clerkUserId,
		event: 'toggle_resident_log_activity_completion',
		details: `activityId=${activityId}, completed=${completed}`,
		deviceId: 'system',
		location: resident?.location || '',
	});

	return updatedActivity;
}

export async function deleteResidentLogActivity(
	clerkUserId: string,
	activityId: string
) {
	await requireCareAccess(clerkUserId);

	const existingActivity = await db.query.residentLogActivities.findFirst({
		where: eq(residentLogActivities.id, activityId),
	});

	if (!existingActivity) {
		throw new Error('Resident log activity not found');
	}

	const residentLog = await db.query.residentLogs.findFirst({
		where: eq(residentLogs.id, existingActivity.logId),
	});
	const resident = residentLog
		? await db.query.residents.findFirst({where: eq(residents.id, residentLog.residentId)})
		: undefined;

	await db.delete(residentLogActivities).where(eq(residentLogActivities.id, activityId));

	await logAudit({
		clerkUserId,
		event: 'delete_resident_log_activity',
		details: `activityId=${activityId}, logId=${existingActivity.logId}`,
		deviceId: 'system',
		location: resident?.location || '',
	});

	return {success: true};
}
