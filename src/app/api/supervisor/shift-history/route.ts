import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {and, desc, eq, gte, inArray, lte} from 'drizzle-orm';

import {db} from '@/db/index';
import {employees, shifts} from '@/db/schema';
import {requireSupervisorAccess} from '@/lib/db-helpers';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const supervisorRole = await requireSupervisorAccess(userId);
		const managedLocations = supervisorRole.locations || [];
		const isAdmin = supervisorRole.role?.toLowerCase() === 'admin';

		const searchParams = req.nextUrl.searchParams;
		const dateFrom = searchParams.get('dateFrom');
		const dateTo = searchParams.get('dateTo');
		const location = searchParams.get('location');
		const staffId = searchParams.get('staffId');
		const limitParam = parseInt(searchParams.get('limit') || '50', 10);
		const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 100) : 50;

		const conditions: any[] = [];
		if (!isAdmin && managedLocations.length > 0) {
			conditions.push(inArray(shifts.location, managedLocations));
		}
		if (dateFrom) {
			conditions.push(gte(shifts.clockInTime, new Date(parseInt(dateFrom, 10))));
		}
		if (dateTo) {
			conditions.push(lte(shifts.clockInTime, new Date(parseInt(dateTo, 10))));
		}
		if (location && location !== 'all') {
			conditions.push(eq(shifts.location, location));
		}
		if (staffId && staffId !== 'all') {
			conditions.push(eq(shifts.clerkUserId, staffId));
		}

		const whereClause = conditions.length > 1 ? and(...conditions) : conditions[0];

		const shiftRows = await db.query.shifts.findMany({
			where: whereClause,
			orderBy: [desc(shifts.clockInTime)],
			limit,
			with: {
				residentLogs: {
					with: {resident: true, activities: true},
				},
			},
		});

		const staffIds = Array.from(new Set(shiftRows.map((row) => row.clerkUserId).filter(Boolean)));
		let staffMap = new Map<string, {name: string; email: string}>();
		if (staffIds.length > 0) {
			const staff = await db.query.employees.findMany({
				where: inArray(employees.clerkUserId, staffIds),
			});
			staffMap = new Map(
				staff.map((emp) => [emp.clerkUserId || '', {name: emp.name || emp.workEmail || 'Unknown', email: emp.workEmail || emp.email || ''}])
			);
		}

		const payload = shiftRows.map((shift) => {
			const staffInfo = staffMap.get(shift.clerkUserId || '') || {name: 'Unknown', email: ''};
			return {
				id: shift.id,
				staffId: shift.clerkUserId,
				staffName: staffInfo.name,
				staffEmail: staffInfo.email,
				location: shift.location,
				clockInTime: shift.clockInTime,
				clockOutTime: shift.clockOutTime,
				notes: shift.notes,
				durationMs: shift.clockOutTime
					? new Date(shift.clockOutTime).getTime() - new Date(shift.clockInTime).getTime()
					: Date.now() - new Date(shift.clockInTime).getTime(),
				isOpen: !shift.clockOutTime,
				residentLogs: shift.residentLogs?.map((log) => ({
					id: log.id,
					residentName: log.resident?.name || 'Resident',
					logType: log.logType,
					content: log.content,
					createdAt: log.createdAt,
					template: log.template,
					activities: log.activities || [],
				})) || [],
			};
		});

		return NextResponse.json(payload);
	} catch (error) {
		console.error('Error fetching shift history:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
