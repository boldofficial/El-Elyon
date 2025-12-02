// src/app/api/care/resident-logs/[logId]/activities/route.ts

import {NextResponse} from "next/server";
import {auth} from "@clerk/nextjs/server";
import {requireCareAccess, logAudit} from "@/lib/db-helpers";
import {
	createResidentLogActivity,
	updateResidentLogActivity,
	toggleResidentLogActivityCompletion,
	deleteResidentLogActivity,
} from "@/db/mutations/care-activities";
import {db} from "@/db/index";
import {residentLogActivities} from "@/db/schema";
import {eq} from "drizzle-orm";

// GET - List resident log activities for a specific log
export async function GET(
	request: Request,
	{params}: {params: Promise<{logId: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: "Unauthorized"}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {logId} = await params;
		const activities = await db.query.residentLogActivities.findMany({
			where: eq(residentLogActivities.logId, logId),
			orderBy: (activities, {asc}) => [asc(activities.timestamp)],
		});

		return NextResponse.json(activities);
	} catch (error: any) {
		console.error("Error fetching resident log activities:", error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// POST - Create a new resident log activity
export async function POST(
	request: Request,
	{params}: {params: Promise<{logId: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: "Unauthorized"}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {logId} = await params;
		const body = await request.json();

		const newActivity = await createResidentLogActivity(userId, {
			logId,
			activityType: body.activityType,
			completed: body.completed,
			notes: body.notes,
		});

		await logAudit({
			clerkUserId: userId,
			event: "CREATE_RESIDENT_LOG_ACTIVITY",
			details: `Created activity ${newActivity.id} for log ${logId}`,
			deviceId: "system",
			location: "", // Location will be derived within the mutation
		});

		return NextResponse.json(newActivity, {status: 201});
	} catch (error: any) {
		console.error("Error creating resident log activity:", error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// PATCH - Update an existing resident log activity or toggle completion
export async function PATCH(
	request: Request,
	{params}: {params: Promise<{logId: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: "Unauthorized"}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {logId} = await params; // Not directly used for update, but for context
		const body = await request.json();
		const activityId = body.activityId; // Expect activityId in the body

		if (!activityId) {
			return NextResponse.json(
				{error: "Activity ID is required for PATCH"},
				{status: 400}
			);
		}

		let updatedActivity;
		if (typeof body.completed === "boolean") {
			// If 'completed' field is provided, it's a toggle request
			updatedActivity = await toggleResidentLogActivityCompletion(
				userId,
				activityId,
				body.completed
			);
			await logAudit({
				clerkUserId: userId,
				event: "TOGGLE_RESIDENT_LOG_ACTIVITY_COMPLETION",
				details: `Toggled activity ${activityId} completion to ${body.completed} for log ${logId}`,
				deviceId: "system",
				location: "",
			});
		} else {
			// Otherwise, it's a general update
			updatedActivity = await updateResidentLogActivity(userId, activityId, {
				activityType: body.activityType,
				notes: body.notes,
			});
			await logAudit({
				clerkUserId: userId,
				event: "UPDATE_RESIDENT_LOG_ACTIVITY",
				details: `Updated activity ${activityId} for log ${logId}`,
				deviceId: "system",
				location: "",
			});
		}

		return NextResponse.json(updatedActivity);
	} catch (error: any) {
		console.error("Error updating resident log activity:", error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// DELETE - Delete a resident log activity
export async function DELETE(
	request: Request,
	{params}: {params: Promise<{logId: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: "Unauthorized"}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {logId} = await params; // Not directly used for delete, but for context
		const {activityId} = await request.json(); // Expect activityId in body

		if (!activityId) {
			return NextResponse.json(
				{error: "Activity ID is required for DELETE"},
				{status: 400}
			);
		}

		await deleteResidentLogActivity(userId, activityId);

		await logAudit({
			clerkUserId: userId,
			event: "DELETE_RESIDENT_LOG_ACTIVITY",
			details: `Deleted activity ${activityId} from log ${logId}`,
			deviceId: "system",
			location: "",
		});

		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error("Error deleting resident log activity:", error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
