// convex/access.ts

import {query, mutation} from './_generated/server';
import {v} from 'convex/values';

// Helper: Get user role and permissions
async function getUserRoleDoc(ctx: any, clerkUserId: string) {
	return await ctx.db
		.query('roles')
		.withIndex('by_clerkUserId', (q: any) => q.eq('clerkUserId', clerkUserId))
		.unique();
}

// Query: Check user access permissions for a route
export const checkAccess = query({
	args: {
		route: v.string(),
		deviceId: v.optional(v.string()),
	},
	handler: async (
		ctx: {db: any; auth: any},
		args: {route: string; deviceId?: string}
	) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			return {
				granted: false,
				reason: 'not_authenticated',
				redirectTo: '/signin',
				userRole: null,
				locations: [],
			};
		}
		const clerkUserId = identity.subject;

		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q: any) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!employee) {
			return {
				granted: false,
				reason: 'user_not_found',
				redirectTo: '/signin',
				userRole: null,
				locations: [],
			};
		}

		// Device authorization check
		if (args.deviceId) {
			if (
				!employee.assignedDeviceId ||
				employee.assignedDeviceId !== args.deviceId
			) {
				// NOTE: Cannot audit in queries - this would need to be logged by the calling component
				return {
					granted: false,
					reason: 'unauthorized_device',
					redirectTo: '/unauthorized-device',
					userRole: null,
					locations: [],
				};
			}
		} else {
			// If deviceId is not provided, and employee has an assigned device, deny access
			if (employee.assignedDeviceId) {
				return {
					granted: false,
					reason: 'device_id_missing',
					redirectTo: '/unauthorized-device',
					userRole: null,
					locations: [],
				};
			}
		}

		const roleDoc = await getUserRoleDoc(ctx, clerkUserId);

		if (!roleDoc) {
			return {
				granted: false,
				reason: 'no_role_assigned',
				redirectTo: '/pending',
				userRole: null,
				locations: [],
			};
		}

		const {role, locations} = roleDoc;

		// Route access rules
		const adminRoutes = ['/admin', '/settings', '/people/employees'];
		const careRoutes = ['/care', '/residents', '/guardians'];
		const publicRoutes = ['/', '/signin', '/pending'];

		let granted = false;
		let reason = '';
		let redirectTo = '';

		// Check if route is public
		if (publicRoutes.some((route) => args.route.startsWith(route))) {
			granted = true;
			reason = 'public_route';
		}
		// Admin access
		else if (adminRoutes.some((route) => args.route.startsWith(route))) {
			if (role === 'admin') {
				granted = true;
				reason = 'admin_access';
			} else {
				granted = false;
				reason = 'insufficient_privileges';
				redirectTo =
					role === 'supervisor' || role === 'staff' ? '/care' : '/pending';
			}
		}
		// Care portal access
		else if (careRoutes.some((route) => args.route.startsWith(route))) {
			if (role === 'supervisor' || role === 'staff') {
				granted = true;
				reason = 'care_access';
			} else if (role === 'admin') {
				granted = true;
				reason = 'admin_override';
			} else {
				granted = false;
				reason = 'insufficient_privileges';
				redirectTo = '/pending';
			}
		}
		// Default deny
		else {
			granted = false;
			reason = 'route_not_found';
			redirectTo =
				role === 'admin'
					? '/admin'
					: role === 'supervisor' || role === 'staff'
						? '/care'
						: '/pending';
		}

		return {
			granted,
			reason,
			redirectTo,
			userRole: role,
			locations: locations || [],
			clerkUserId,
			userName: employee.name || employee.workEmail || 'Unknown',
		};
	},
});

// Query: Get user session info
export const getSessionInfo = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			return {
				authenticated: false,
				user: null,
				role: null,
				locations: [],
				defaultRoute: '/signin',
			};
		}
		const clerkUserId = identity.subject;

		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q: any) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!employee) {
			return {
				authenticated: false,
				user: null,
				role: null,
				locations: [],
				defaultRoute: '/signin',
			};
		}

		const roleDoc = await getUserRoleDoc(ctx, clerkUserId);

		if (!roleDoc) {
			return {
				authenticated: true,
				user: {
					id: employee.clerkUserId,
					name: employee.name || employee.workEmail || 'Unknown',
					email: employee.workEmail,
				},
				role: null,
				locations: [],
				defaultRoute: '/pending',
			};
		}

		const {role, locations} = roleDoc;

		// Determine default route based on role
		let defaultRoute = '/pending';
		if (role === 'admin') {
			defaultRoute = '/admin';
		} else if (role === 'supervisor' || role === 'staff') {
			defaultRoute = '/care';
		}

		return {
			authenticated: true,
			user: {
				id: employee.clerkUserId,
				name: employee.name || employee.workEmail || 'Unknown',
				email: employee.workEmail,
			},
			role,
			locations: locations || [],
			defaultRoute,
		};
	},
});

// Mutation: Log session activity
export const logSessionActivity = mutation({
	args: {
		activity: v.string(),
		details: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return;
		const clerkUserId = identity.subject;

		await ctx.db.insert('audit_logs', {
			clerkUserId,
			event: args.activity,
			timestamp: Date.now(),
			deviceId: 'web',
			location: 'system',
			details: args.details,
		});
	},
});
