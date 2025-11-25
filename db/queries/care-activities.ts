// src/db/queries/care-activities.ts

import {db} from '../index';
import {residentLogActivities, residentLogs} from '../schema';
import {eq} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';

// ============================
// Care Activity Queries
// ============================

export async function getLogActivities(logId: string, clerkUserId: string) {
	await requireCareAccess(clerkUserId);

	const activities = await db.query.residentLogActivities.findMany({
		where: eq(residentLogActivities.logId, logId),
	});

	return activities;
}

export async function getResidentLogWithActivities(
	logId: string,
	clerkUserId: string
) {
	await requireCareAccess(clerkUserId);

	const log = await db.query.residentLogs.findFirst({
		where: eq(residentLogs.id, logId),
		with: {
			activities: true,
		},
	});

	return log;
}
