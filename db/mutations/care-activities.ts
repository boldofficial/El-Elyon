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

export async function createResidentLogWithActivities(
	data: {
		residentId: string;
		logType: string;
		content?: string;
		location: string;
		shiftId?: string;
		authorId: string;
		authorName: string;
		template?: string;
		activities: Array<{
			activityType: string;
			completed?: boolean;
			notes?: string;
		}>;
	}
) {
	await requireCareAccess(data.authorId); // Assuming authorId is the clerkUserId for access control

	// 1. Create the resident log
	const [newLog] = await db
		.insert(residentLogs)
		.values({
			residentId: data.residentId,
			logType: data.logType,
			content: data.content,
			location: data.location,
			shiftId: data.shiftId,
			authorId: data.authorId,
			authorName: data.authorName,
			template: data.template,
			createdAt: new Date(),
		})
		.returning();

	if (!newLog) {
		throw new Error('Failed to create resident log');
	}

	// 2. Create associated activities
	if (data.activities && data.activities.length > 0) {
		const activitiesToInsert = data.activities.map((activity) => ({
			logId: newLog.id,
			activityType: activity.activityType,
			completed: activity.completed ?? false,
			notes: activity.notes,
			timestamp: new Date(),
		}));
		await db.insert(residentLogActivities).values(activitiesToInsert);
	}

	// 3. Log audit
	await logAudit({
		clerkUserId: data.authorId,
		event: 'create_resident_log_with_activities',
		details: `logId=${newLog.id}, residentId=${data.residentId}, logType=${data.logType}`,
		deviceId: 'system',
		location: data.location,
	});

	return newLog;
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
