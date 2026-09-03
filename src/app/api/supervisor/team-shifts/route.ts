import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {requireSupervisorAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {employees, residentLogs, shifts} from '@/db/schema';
import {and, desc, eq, gte, inArray, lte} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userRole = await requireSupervisorAccess(userId);
		const searchParams = req.nextUrl.searchParams;
		const dateFrom = searchParams.get('dateFrom');
		const dateTo = searchParams.get('dateTo');
		const locationParam = searchParams.get('location');
		const staffId = searchParams.get('staffId');
		const limit = parseInt(searchParams.get('limit') || '50', 10);

		const conditions: any[] = [];
		const scopedLocations = userRole.locations || [];

		if (dateFrom) {
			conditions.push(gte(shifts.clockInTime, new Date(parseInt(dateFrom))));
		}
		if (dateTo) {
			conditions.push(lte(shifts.clockInTime, new Date(parseInt(dateTo))));
		}
		if (locationParam && locationParam !== 'all') {
			conditions.push(eq(shifts.location, locationParam));
		} else if (scopedLocations.length > 0 && userRole.role !== 'admin') {
			conditions.push(inArray(shifts.location, scopedLocations));
		}
		if (staffId && staffId !== 'all') {
			conditions.push(eq(shifts.clerkUserId, staffId));
		}

		const scopedShifts = await db
			.select({
				shift: shifts,
				employeeName: employees.name,
				employeeEmail: employees.email,
			})
			.from(shifts)
			.leftJoin(employees, eq(employees.clerkUserId, shifts.clerkUserId))
			.where(conditions.length > 0 ? and(...conditions) : undefined)
			.orderBy(desc(shifts.clockInTime))
			.limit(Math.min(Math.max(limit, 1), 200));

		const shiftIds = scopedShifts
			.map((row) => row.shift.id)
			.filter(Boolean) as string[];

		const logsByShift: Record<string, any[]> = {};
		const activitiesByShift: Record<string, number> = {};

		if (shiftIds.length > 0) {
			const logs = await db.query.residentLogs.findMany({
				where: inArray(residentLogs.shiftId, shiftIds),
				with: {activities: true, resident: true},
			});

			for (const log of logs) {
				const key = log.shiftId as string;
				if (!logsByShift[key]) logsByShift[key] = [];
				logsByShift[key].push({
					id: log.id,
					logType: log.logType,
					template: log.template,
					content: log.content,
					authorId: log.authorId,
					authorName: log.authorName,
					createdAt: log.createdAt,
					residentName: log.resident?.name,
					residentLocation: log.resident?.location,
					activities: (log.activities || []).map((activity) => ({
						id: activity.id,
						activityType: activity.activityType,
						completed: activity.completed,
						notes: activity.notes,
					})),
				});

				activitiesByShift[key] =
					(activitiesByShift[key] || 0) + (log.activities?.length || 0);
			}
		}

		const response = scopedShifts.map((row) => {
			const shiftId = row.shift.id;
			return {
				shiftId,
				staffId: row.shift.clerkUserId,
				staffName: row.employeeName || 'Unknown',
				staffEmail: row.employeeEmail || '',
				location: row.shift.location,
				clockInTime: row.shift.clockInTime,
				clockOutTime: row.shift.clockOutTime,
				durationMs: row.shift.clockOutTime
					? new Date(row.shift.clockOutTime).getTime() -
					  new Date(row.shift.clockInTime).getTime()
					: Date.now() - new Date(row.shift.clockInTime).getTime(),
				logs: logsByShift[shiftId] || [],
				logCount: (logsByShift[shiftId] || []).length,
				activityCount: activitiesByShift[shiftId] || 0,
			};
		});

		return NextResponse.json(response);
	} catch (error) {
		console.error('Error getting team shifts:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}