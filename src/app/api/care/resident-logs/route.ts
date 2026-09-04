// src/app/api/care/resident-logs/route.ts

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs, residentLogActivities, residents, employees, shifts} from '@/db/schema';
import {eq, desc, asc, SQL, and, isNull} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';
import {searchCondition, paginatePage} from '@/db/query-helpers';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not uuuuuuuuauthenticated'}, {status: 401});
		}

		const searchParams = req.nextUrl.searchParams;
		const residentId = searchParams.get('residentId');
		const location = searchParams.get('location');
		const parsedLimit = parseInt(searchParams.get('limit') || '50', 10);
		const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 50;
		const parsedOffset = parseInt(searchParams.get('offset') || '0', 10);
		const offset = Number.isFinite(parsedOffset) && parsedOffset > 0 ? parsedOffset : 0;
		const search = searchParams.get('search')?.trim();

		const conditions: SQL[] = [];

		if (residentId) {
			conditions.push(eq(residentLogs.residentId, residentId));
		}

		const searchClause = searchCondition(search, [residentLogs.content, residentLogs.authorName]);
		if (searchClause) {
			conditions.push(searchClause);
		}

		const userRole = await requireCareAccess(userId);
		if (userRole.role === 'admin') {
			if (location) {
				conditions.push(eq(residentLogs.location, location));
			}
		} else {
			const currentShift = await db.query.shifts.findFirst({
				where: and(eq(shifts.clerkUserId, userId), isNull(shifts.clockOutTime)),
				orderBy: [desc(shifts.clockInTime)],
			});

			if (!currentShift) {
				const emptyResponse = NextResponse.json([]);
				emptyResponse.headers.set('X-Has-More', 'false');
				return emptyResponse;
			}

			conditions.push(eq(residentLogs.location, currentShift.location));
		}

		const logs = await db.query.residentLogs.findMany({
			where:
				conditions.length > 0 ? (residentLogs, {and}) => and(...conditions) : undefined,
			limit: limit + 1,
			offset,
			orderBy: [desc(residentLogs.createdAt)],
			with: {
				resident: true,
				activities: {
					orderBy: (activities, {asc}) => [asc(activities.timestamp)],
				},
			},
		});

		const {items: pageLogs, hasMore} = paginatePage(logs, limit);

		const employeeList = await db.query.employees.findMany();

		const formattedLogs = pageLogs.map((log: any) => {
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

		const response = NextResponse.json(formattedLogs);
		response.headers.set('X-Has-More', String(hasMore));
		return response;
	} catch (error) {
		console.error('Error getting logs:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
