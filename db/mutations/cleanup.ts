import {db} from '../index';
import {
	shifts,
	residentLogs,
	roles,
	employees,
	users,
	ispAccessLogs,
	ispAcknowledgments,
	complianceAlerts,
	residents,
	guardians,
	kiosks,
	auditLogs,
} from '../schema';
import {eq, and, isNull, inArray} from 'drizzle-orm';
import {requireAdminAccess} from '@/lib/db-helpers';
import {logAudit} from './audit';
import {clerkClient} from '@clerk/nextjs/server';

// Helper: Delete user and all related records
async function deleteUserAndRelatedRecords(clerkUserId: string) {
	// 1. Delete shifts
	await db.delete(shifts).where(eq(shifts.clerkUserId, clerkUserId));

	// 2. Delete resident logs
	await db.delete(residentLogs).where(eq(residentLogs.authorId, clerkUserId));

	// 3. Delete ISP access logs
	await db.delete(ispAccessLogs).where(eq(ispAccessLogs.clerkUserId, clerkUserId));

	// 4. Delete role record
	await db.delete(roles).where(eq(roles.clerkUserId, clerkUserId));

	// 5. Delete employee record
	await db.delete(employees).where(eq(employees.clerkUserId, clerkUserId));

	// 6. Delete user record (if exists in our `users` table)
	await db.delete(users).where(eq(users.clerkUserId, clerkUserId));

	// 7. Update related records where clerkUserId is a foreign key
	// For complianceAlerts, set dismissedBy to null
	await db.update(complianceAlerts).set({dismissedBy: null}).where(eq(complianceAlerts.dismissedBy, clerkUserId));

	// For residents, set createdBy to null
	await db.update(residents).set({createdBy: null}).where(eq(residents.createdBy, clerkUserId));

	// For guardians, set createdBy to null
	await db.update(guardians).set({createdBy: null}).where(eq(guardians.createdBy, clerkUserId));

	// For kiosks, set createdBy and registeredBy to null
	await db.update(kiosks).set({createdBy: null, registeredBy: null}).where(
		and(
			eq(kiosks.createdBy, clerkUserId),
			eq(kiosks.registeredBy, clerkUserId)
		)
	);

	// 8. Delete audit logs
	await db.delete(auditLogs).where(eq(auditLogs.clerkUserId, clerkUserId));

	// 9. Delete Clerk user account
	try {
		const client = await clerkClient(); // Call clerkClient to get the instance
		await client.users.deleteUser(clerkUserId);
		console.log(`Successfully deleted Clerk user: ${clerkUserId}`);
	} catch (error) {
		console.error(`Failed to delete Clerk user ${clerkUserId}:`, error);
		// Don't throw, continue with local cleanup
	}
}

// Clean up orphaned users (users without proper records)
export async function cleanupOrphanedUsers(adminClerkUserId: string) {
	await requireAdminAccess(adminClerkUserId);

	const allEmployees = await db.query.employees.findMany();
	const allRoles = await db.query.roles.findMany();
	const allUsers = await db.query.users.findMany(); // Our internal users table

	// Create sets of clerkUserIds from each table
	const employeeClerkUserIds = new Set(allEmployees.map((emp) => emp.clerkUserId).filter((id): id is string => id !== null));
	const roleClerkUserIds = new Set(allRoles.map((role) => role.clerkUserId).filter((id): id is string => id !== null));
	const userClerkUserIds = new Set(allUsers.map((user) => user.clerkUserId).filter((id): id is string => id !== null));

	const deletedUsers = [];

	// Find all unique clerkUserIds across all tables
	const allClerkUserIds = new Set([
		...employeeClerkUserIds,
		...roleClerkUserIds,
		...userClerkUserIds,
	]);

	// Check each clerkUserId for orphaned records
	for (const id of allClerkUserIds) {
		// Skip the current admin user
		if (id === adminClerkUserId) continue;

		const hasEmployee = employeeClerkUserIds.has(id);
		const hasRole = roleClerkUserIds.has(id);
		const hasUser = userClerkUserIds.has(id);

		// A user is orphaned if they're missing any of the three core records
		// OR if they have records but no employee (employee is the source of truth)
		const isOrphaned = !hasEmployee || !hasRole || !hasUser;

		if (isOrphaned) {
			const roleDoc = allRoles.find((r) => r.clerkUserId === id);
			await deleteUserAndRelatedRecords(id);
			deletedUsers.push({
				clerkUserId: id,
				role: roleDoc?.role || 'unknown',
				reason: {
					missingEmployee: !hasEmployee,
					missingRole: !hasRole,
					missingUser: !hasUser,
				},
			});
		}
	}

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_users',
		details: `orphanedUsersFound=${deletedUsers.length}`,
		deviceId: 'system',
		location: '',
	});

	return {
		success: true,
		totalEmployees: allEmployees.length,
		totalRoles: allRoles.length,
		totalUsers: allUsers.length,
		orphanedUsersFound: deletedUsers.length,
		deleted: deletedUsers,
	};
}
