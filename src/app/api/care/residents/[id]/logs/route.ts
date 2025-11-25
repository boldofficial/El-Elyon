// src/app/api/care/residents/[id]/logs/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess, logAudit} from '@/lib/db-helpers';
import {createResidentLogWithActivities} from '@/db/mutations/care-activities';
import {db} from '@/db/index';
import {residentLogs} from '@/db/schema';
import {eq, desc} from 'drizzle-orm';

// GET - List resident logs
export async function GET(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {id: residentId} = await params;
		const {searchParams} = new URL(request.url);
		const limit = parseInt(searchParams.get('limit') || '50');

		const logs = await db.query.residentLogs.findMany({
			where: eq(residentLogs.residentId, residentId),
			orderBy: [desc(residentLogs.createdAt)],
			limit,
			with: {
				activities: true,
			},
		});

		return NextResponse.json(logs);
	} catch (error: any) {
		console.error('Error fetching resident logs:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// POST - Create new resident log with activities
export async function POST(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {id: residentId} = await params;
		const body = await request.json();

		const result = await createResidentLogWithActivities({
			residentId,
			logType: body.logType || 'daily_activities',
			content: body.content,
			location: body.location,
			shiftId: body.shiftId,
			authorId: userId,
			authorName: body.authorName || 'Unknown Staff',
			template: body.template,
			activities: body.activities,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'CREATE_RESIDENT_LOG',
			details: `Created ${body.logType} log for resident ${residentId}`,
			deviceId: 'system',
			location: body.location,
		});

		return NextResponse.json(result, {status: 201});
	} catch (error: any) {
		console.error('Error creating resident log:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
