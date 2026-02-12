import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {and, desc, eq, inArray} from 'drizzle-orm';

import {db} from '@/db/index';
import {employees, residentLogs, roles, shifts} from '@/db/schema';
import {requireSupervisorAccess} from '@/lib/db-helpers';

export async function GET(_req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const supervisorRole = await requireSupervisorAccess(userId);
		const managedLocations = supervisorRole.locations || [];
		const isAdmin = supervisorRole.role?.toLowerCase() === 'admin';

		// Pull all roles and filter by overlap with the supervisor's locations (admins see all).
		const allRoles = await db.query.roles.findMany();
		const teamRoles = allRoles.filter((role) => {
			if (role.role === 'admin') return false;
			if (isAdmin) return ['staff', 'supervisor'].includes(role.role || '');
			const roleLocations = role.locations || [];
			return (
				['staff', 'supervisor'].includes(role.role || '') &&
				roleLocations.some((loc) => managedLocations.includes(loc))
			);
		});

		const results = await Promise.all(
			teamRoles.map(async (role) => {
				const employee = await db.query.employees.findFirst({
					where: eq(employees.clerkUserId, role.clerkUserId),
				});
				if (!employee) return null;

				const shiftConditions = [eq(shifts.clerkUserId, role.clerkUserId)];
				if (!isAdmin && managedLocations.length > 0) {
					shiftConditions.push(inArray(shifts.location, managedLocations));
				}

				const latestShift = await db.query.shifts.findFirst({
					where:
						shiftConditions.length > 1
							? and(...shiftConditions)
							: shiftConditions[0],
					orderBy: [desc(shifts.clockInTime)],
				});

				let shiftActivities: any[] = [];
				if (latestShift) {
					shiftActivities = await db.query.residentLogs.findMany({
						where: eq(residentLogs.shiftId, latestShift.id),
						orderBy: [desc(residentLogs.createdAt)],
						limit: 8,
						with: {
							resident: true,
							activities: true,
						},
					});
				}

				return {
					staffId: role.clerkUserId,
					staffName: employee.name || employee.workEmail || 'Unknown',
					staffEmail: employee.workEmail || employee.email,
					role: role.role,
					locations: role.locations || employee.locations || [],
					latestShift: latestShift
						? {
							id: latestShift.id,
							location: latestShift.location,
							clockInTime: latestShift.clockInTime,
							clockOutTime: latestShift.clockOutTime,
							notes: latestShift.notes,
							clockInSelfie: latestShift.clockInSelfie,
							clockOutSelfie: latestShift.clockOutSelfie,
							durationMs: latestShift.clockOutTime
								? new Date(latestShift.clockOutTime).getTime() -
								  new Date(latestShift.clockInTime).getTime()
								: Date.now() - new Date(latestShift.clockInTime).getTime(),
							isOpen: !latestShift.clockOutTime,
						}
						: null,
					activities: shiftActivities.map((log) => ({
						id: log.id,
						residentName: log.resident?.name || 'Resident',
						logType: log.logType,
						content: log.content,
						createdAt: log.createdAt,
						template: log.template,
						activities: log.activities || [],
					})),
				};
			})
		);

		return NextResponse.json(results.filter(Boolean));
	} catch (error) {
		console.error('Error getting team latest shifts:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
