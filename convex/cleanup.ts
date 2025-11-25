import {mutation} from './_generated/server';

// Helper: Get user role doc
async function getUserRoleDoc(ctx: any, clerkUserId: string) {
	return await ctx.db
		.query('roles')
		.withIndex('by_clerkUserId', (q: any) => q.eq('clerkUserId', clerkUserId))
		.unique();
}

// Helper: Check if user has admin access
async function requireAdminAccess(ctx: any, clerkUserId: string) {
	const userRole = await getUserRoleDoc(ctx, clerkUserId);
	if (!userRole || userRole.role !== 'admin') {
		throw new Error('Admin access required');
	}
	return userRole;
}

// Helper: Delete user and all related records
async function deleteUserAndRelatedRecords(
	ctx: any,
	targetClerkUserId: string
) {
	// 1. Delete shifts
	const shifts = await ctx.db
		.query('shifts')
		.withIndex('by_clerkUserId', (q: any) =>
			q.eq('clerkUserId', targetClerkUserId)
		)
		.collect();
	for (const shift of shifts) {
		await ctx.db.delete(shift._id);
	}

	// 2. Delete resident logs
	const residentLogs = await ctx.db
		.query('resident_logs')
		.withIndex('by_authorId', (q: any) => q.eq('authorId', targetClerkUserId))
		.collect();
	for (const log of residentLogs) {
		await ctx.db.delete(log._id);
	}

	// 3. Delete ISP access logs
	const ispAccessLogs = await ctx.db
		.query('isp_access_logs')
		.withIndex('by_clerkUserId', (q: any) =>
			q.eq('clerkUserId', targetClerkUserId)
		)
		.collect();
	for (const log of ispAccessLogs) {
		await ctx.db.delete(log._id);
	}

	// 4. Delete role record
	const roleDoc = await ctx.db
		.query('roles')
		.withIndex('by_clerkUserId', (q: any) =>
			q.eq('clerkUserId', targetClerkUserId)
		)
		.unique();
	if (roleDoc) {
		await ctx.db.delete(roleDoc._id);
	}

	// 5. Delete employee record
	const employee = await ctx.db
		.query('employees')
		.withIndex('by_clerkUserId', (q: any) =>
			q.eq('clerkUserId', targetClerkUserId)
		)
		.first();
	if (employee) {
		await ctx.db.delete(employee._id);
	}

	// 6. Delete user record
	const user = await ctx.db
		.query('users')
		.withIndex('by_clerkUserId', (q: any) =>
			q.eq('clerkUserId', targetClerkUserId)
		)
		.first();
	if (user) {
		await ctx.db.delete(user._id);
	}

	// 7. Delete auth accounts
	const authAccounts = await ctx.db
		.query('authAccounts')
		.filter((q: any) => q.eq(q.field('clerkUserId'), targetClerkUserId))
		.collect();
	for (const authAccount of authAccounts) {
		await ctx.db.delete(authAccount._id);
	}

	// 8. Delete auth sessions
	const authSessions = await ctx.db
		.query('authSessions')
		.filter((q: any) => q.eq(q.field('clerkUserId'), targetClerkUserId))
		.collect();
	for (const session of authSessions) {
		await ctx.db.delete(session._id);
	}
}

// Clean up orphaned users (users without proper records)
export const cleanupOrphanedUsers = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;
		await requireAdminAccess(ctx, clerkUserId);

		const allEmployees = await ctx.db.query('employees').collect();
		const allRoles = await ctx.db.query('roles').collect();
		const allUsers = await ctx.db.query('users').collect();

		// Create sets of clerkUserIds from each table
		const employeeClerkUserIds = new Set(
			allEmployees.map((emp) => emp.clerkUserId).filter((id): id is string => id !== undefined)
		);

		const roleClerkUserIds = new Set(allRoles.map((role) => role.clerkUserId).filter(Boolean));

		const userClerkUserIds = new Set(allUsers.map((user) => user.clerkUserId).filter(Boolean));

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
			if (id === clerkUserId) continue;

			const hasEmployee = employeeClerkUserIds.has(id);
			const hasRole = roleClerkUserIds.has(id);
			const hasUser = userClerkUserIds.has(id);

			// A user is orphaned if they're missing any of the three core records
			// OR if they have records but no employee (employee is the source of truth)
			const isOrphaned = !hasEmployee || !hasRole || !hasUser;

			if (isOrphaned) {
				const roleDoc = allRoles.find((r) => r.clerkUserId === id);
				await deleteUserAndRelatedRecords(ctx, id);
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

		return {
			success: true,
			totalEmployees: allEmployees.length,
			totalRoles: allRoles.length,
			totalUsers: allUsers.length,
			orphanedUsersFound: deletedUsers.length,
			deleted: deletedUsers,
		};
	},
});
