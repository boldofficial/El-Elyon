// src/app/api/care/residents/[id]/logs/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {
	AccessDeniedError,
	requireCareAccess,
	requireResidentInScope,
	logAudit,
} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {createResidentLogWithActivities} from '@/db/mutations/care-activities';
import {db} from '@/db/index';
import {employees, residentLogs, residents} from '@/db/schema';
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
		const userRole = await requireCareAccess(userId);

		const {id: residentId} = await params;
		await requireResidentInScope({
			clerkUserId: userId,
			userRole,
			residentId,
			auditDetail: 'resident_logs_read_cross_location',
		});

		const {searchParams} = new URL(request.url);
		const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
		const limit =
			Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;

		const logs = await db.query.residentLogs.findMany({
			where: eq(residentLogs.residentId, residentId),
			orderBy: [desc(residentLogs.createdAt)],
			limit,
			with: {
				activities: true,
			},
		});

		return NextResponse.json(logs);
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: 'Access denied'}, {status: 403});
		}
		return internalServerError(error, 'GetResidentLogs');
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
		const userRole = await requireCareAccess(userId);

		const {id: residentId} = await params;
		await requireResidentInScope({
			clerkUserId: userId,
			userRole,
			residentId,
			auditDetail: 'resident_logs_write_cross_location',
		});
		const body = await request.json();

		// The log's location and author come from the database, never the
		// request body, so a log cannot be filed under another home or name.
		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, residentId),
			columns: {location: true},
		});
		if (!resident) {
			throw new AccessDeniedError('Resident is outside your locations');
		}
		const author = await db.query.employees.findFirst({
			where: eq(employees.clerkUserId, userId),
			columns: {name: true},
		});

		const result = await createResidentLogWithActivities({
			residentId,
			logType: body.logType || 'daily_activities',
			content: body.content,
			location: resident.location,
			shiftId: body.shiftId,
			authorId: userId,
			authorName: author?.name?.trim() || 'Unknown Staff',
			template: body.template,
			activities: body.activities,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'CREATE_RESIDENT_LOG',
			details: `Created ${body.logType} log for resident ${residentId}`,
			deviceId: 'system',
			location: resident.location,
		});

		return NextResponse.json(result, {status: 201});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: 'Access denied'}, {status: 403});
		}
		return internalServerError(error, 'CreateResidentLog');
	}
}
