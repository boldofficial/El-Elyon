// src/app/api/care/resident-logs/route.ts

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs, residentLogActivities, residents, employees, shifts} from '@/db/schema';
import {eq, desc, asc, SQL, and, isNull} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not uuuuuuuuauthenticated'}, {status: 401});
		}

		const searchParams = req.nextUrl.searchParams;
		const residentId = searchParams.get('residentId');
		const location = searchParams.get('location');
		const limit = parseInt(searchParams.get('limit') || '50');

		const conditions: SQL[] = [];

		if (residentId) {
			conditions.push(eq(residentLogs.residentId, residentId));
		}

		const userRole = await requireCareAccess(userId);
		if (userRole.role !== 'admin') {
			const currentShift = await db.query.shifts.findFirst({
				where: and(eq(shifts.clerkUserId, userId), isNull(shifts.clockOutTime)),
				orderBy: [desc(shifts.clockInTime)],
			});

			if (!currentShift) {
				return NextResponse.json([]);
			}

			conditions.push(eq(residentLogs.location, currentShift.location));
		}

		const logs = await db.query.residentLogs.findMany({
			where:
				conditions.length > 0 ? (residentLogs, {and}) => and(...conditions) : undefined,
			limit,
			orderBy: [desc(residentLogs.createdAt)],
			with: {
				resident: true,
				activities: {
					orderBy: (activities, {asc}) => [asc(activities.timestamp)],
				},
			},
		});

		const employeeList = await db.query.employees.findMany();

		const formattedLogs = logs.map((log: any) => {
			const author = employeeList.find(
				(employee) => employee.clerkUserId === log.authorId
			);

			return {
				...log,
				residentName: log.resident?.name,
				residentLocation: log.resident?.location,
				authorName: log.authorName || author?.name || author?.workEmail,
			};
		});

		return NextResponse.json(formattedLogs);
	} catch (error) {
		console.error('Error getting logs:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
