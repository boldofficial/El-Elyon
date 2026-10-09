import {auth} from '@clerk/nextjs/server';
import {and, eq, gt, isNull, lt, or} from 'drizzle-orm';
import {db} from '@/db/index';
import {employees, locations, roles, shifts} from '@/db/schema';
import {getOperationalTimeZone, resolveAuthorizedCareLocation} from '@/db/queries/care';
import {getUserRoleDoc, logAudit} from '@/lib/db-helpers';
import {createMissedShiftHandlers} from './handler';

export const {GET, POST} = createMissedShiftHandlers({
	getUserId: async () => (await auth()).userId,
	getRole: getUserRoleDoc,
	listActiveLocationNames: async () => {
		const rows = await db
			.select({name: locations.name})
			.from(locations)
			.where(eq(locations.status, 'active'));
		return rows.map((row) => row.name);
	},
	listPeople: async () => {
		const rows = await db
			.select({
				clerkUserId: roles.clerkUserId,
				role: roles.role,
				roleLocations: roles.locations,
				name: employees.name,
				employeeLocations: employees.locations,
			})
			.from(roles)
			.innerJoin(employees, eq(employees.clerkUserId, roles.clerkUserId));
		// Same merge as getUserRoleDoc: a person's houses are the union of both rows.
		return rows.map((row) => ({
			clerkUserId: row.clerkUserId,
			role: row.role,
			name: row.name || 'Unknown',
			locations: Array.from(
				new Set([...(row.roleLocations || []), ...(row.employeeLocations || [])])
			),
		}));
	},
	// Only checks the house exists and is active; who may use it is
	// missedShiftAccessError's job.
	resolveLocation: (name) =>
		resolveAuthorizedCareLocation(db, {role: 'admin', authorizedLocationNames: [], locationName: name}),
	getTimeZone: () => getOperationalTimeZone(),
	findShiftsBetween: (clerkUserId, from, to) =>
		db
			.select({clockInTime: shifts.clockInTime, clockOutTime: shifts.clockOutTime})
			.from(shifts)
			.where(
				and(
					eq(shifts.clerkUserId, clerkUserId),
					lt(shifts.clockInTime, to),
					or(isNull(shifts.clockOutTime), gt(shifts.clockOutTime, from))
				)
			),
	insertShift: async (shift) => {
		const [row] = await db.insert(shifts).values(shift).returning({id: shifts.id});
		if (!row) throw new Error('Failed to record the missed shift');
		return row;
	},
	audit: ({actorId, shift}) =>
		logAudit({
			clerkUserId: actorId,
			event: 'missed_shift.recorded',
			details: `staff=${shift.clerkUserId},shiftSlot=${shift.shiftSlot},operationalDate=${shift.operationalDate},clockIn=${shift.clockInTime.toISOString()},clockOut=${shift.clockOutTime.toISOString()}`,
			deviceId: 'system',
			location: shift.location,
		}),
});
