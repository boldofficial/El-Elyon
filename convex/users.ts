// convex/users.ts

import {query} from './_generated/server';

// Get current user info
export const getCurrentUser = query({
	handler: async (ctx) => {
		// Get user identity
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return null;
		}
		const clerkUserId = identity.subject;

		// Get user from users table
		const user = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		// Get role
		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		// Get employee info
		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		return {
			clerkUserId: clerkUserId,
			email:
				user?.email || employee?.workEmail || employee?.email || identity.email,
			name: user?.name || employee?.name || identity.name,
			role: role?.role || 'staff',
			locations: role?.locations || employee?.locations || [],
			lastLoginAt: user?.lastLoginAt,
			lastLoginDeviceId: user?.lastLoginDeviceId,
			lastLoginLocation: user?.lastLoginLocation,
		};
	},
});

// Get all users (admin only)
export const listUsers = query({
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}
		const clerkUserId = identity.subject;

		// Check if user is admin
		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		if (role?.role !== 'admin') {
			throw new Error('Only admins can view users');
		}

		const users = await ctx.db.query('users').collect();

		// Enrich with role and employee data
		const enrichedUsers = await Promise.all(
			users.map(async (user) => {
				const userRole = await ctx.db
					.query('roles')
					.withIndex('by_clerkUserId', (q) =>
						q.eq('clerkUserId', user.clerkUserId)
					)
					.first();

				const employee = await ctx.db
					.query('employees')
					.withIndex('by_clerkUserId', (q) =>
						q.eq('clerkUserId', user.clerkUserId)
					)
					.first();

				return {
					...user,
					role: userRole?.role || 'staff',
					locations: userRole?.locations || employee?.locations || [],
					employmentStatus: employee?.employmentStatus,
				};
			})
		);

		return enrichedUsers.sort(
			(a, b) => (b.lastLoginAt || 0) - (a.lastLoginAt || 0)
		);
	},
});
