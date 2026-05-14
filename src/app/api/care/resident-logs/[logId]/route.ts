import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {and, eq} from 'drizzle-orm';
import {db} from '@/db/index';
import {residentLogActivities, residentLogs} from '@/db/schema';
import {requireCareAccess, logAudit} from '@/lib/db-helpers';

const EDIT_WINDOW_MS = 60 * 60 * 1000;

type EditableActivity = {
	id?: string;
	activityType?: string;
	completed?: boolean;
	notes?: string;
};

export async function PATCH(
	request: Request,
	{params}: {params: Promise<{logId: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const userRole = await requireCareAccess(userId);
		const {logId} = await params;
		const body = await request.json();
		const content = typeof body.content === 'string' ? body.content.trim() : '';
		const activities: EditableActivity[] = Array.isArray(body.activities)
			? body.activities
			: [];

		if (!content) {
			return NextResponse.json(
				{error: 'General notes are required'},
				{status: 400}
			);
		}

		if (!activities.some((activity) => activity.completed === true)) {
			return NextResponse.json(
				{error: 'At least one completed activity is required'},
				{status: 400}
			);
		}

		const existingLog = await db.query.residentLogs.findFirst({
			where: eq(residentLogs.id, logId),
		});

		if (!existingLog) {
			return NextResponse.json({error: 'Log not found'}, {status: 404});
		}

		if (existingLog.authorId !== userId) {
			return NextResponse.json(
				{error: 'Only the submitting staff member can edit this log'},
				{status: 403}
			);
		}

		const createdAt = existingLog.createdAt || existingLog.timestamp;
		if (!createdAt || Date.now() - createdAt.getTime() > EDIT_WINDOW_MS) {
			return NextResponse.json(
				{error: 'Logs can only be edited within 1 hour of submission'},
				{status: 403}
			);
		}

		const userLocations = userRole.role === 'admin' ? [] : userRole.locations || [];
		if (
			userRole.role !== 'admin' &&
			existingLog.location &&
			!userLocations.includes(existingLog.location)
		) {
			return NextResponse.json({error: 'Access denied'}, {status: 403});
		}

		const existingActivities = await db.query.residentLogActivities.findMany({
			where: eq(residentLogActivities.logId, logId),
		});
		const existingActivityIds = new Set(
			existingActivities.map((activity) => activity.id)
		);

		await db
			.update(residentLogs)
			.set({content})
			.where(eq(residentLogs.id, logId));

		let changedActivityCount = 0;
		for (const activity of activities) {
			if (!activity.id || !existingActivityIds.has(activity.id)) continue;

			const current = existingActivities.find((item) => item.id === activity.id);
			const nextActivityType =
				typeof activity.activityType === 'string'
					? activity.activityType
					: current?.activityType || '';
			if (!nextActivityType.trim()) continue;

			const nextCompleted = activity.completed === true;
			const nextNotes =
				typeof activity.notes === 'string' ? activity.notes : current?.notes || '';

			if (
				current?.activityType !== nextActivityType ||
				current?.completed !== nextCompleted ||
				(current?.notes || '') !== nextNotes
			) {
				changedActivityCount += 1;
			}

			await db
				.update(residentLogActivities)
				.set({
					activityType: nextActivityType,
					completed: nextCompleted,
					notes: nextNotes,
				})
				.where(
					and(
						eq(residentLogActivities.id, activity.id),
						eq(residentLogActivities.logId, logId)
					)
				);
		}

		await logAudit({
			clerkUserId: userId,
			event: 'resident.log.edited',
			details: `logId=${logId},residentId=${existingLog.residentId},contentChanged=${existingLog.content !== content},activityChanges=${changedActivityCount}`,
			deviceId: 'system',
			location: existingLog.location || '',
		});

		const updatedActivities = await db.query.residentLogActivities.findMany({
			where: eq(residentLogActivities.logId, logId),
			orderBy: (activities, {asc}) => [asc(activities.timestamp)],
		});

		return NextResponse.json({
			...existingLog,
			content,
			activities: updatedActivities,
		});
	} catch (error) {
		console.error('Error editing resident log:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
