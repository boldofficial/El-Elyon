// NO 'use node' here!
import {internalMutation} from './_generated/server';
import {v} from 'convex/values';

/**
 * Internal mutation: Sync user from Clerk to Convex
 * ✅ FIXED: Now reads metadata to get role/locations/device
 */
export const syncUserFromClerk = internalMutation({
	args: {
		clerkUserId: v.string(),
		email: v.string(),
		name: v.string(),
		createdAt: v.number(),
		role: v.union(
			v.literal('admin'),
			v.literal('supervisor'),
			v.literal('staff')
		),
		locations: v.array(v.string()) || [],
		assignedDeviceId: v.optional(v.string()) || undefined,
	},
	handler: async (ctx, args) => {
		console.log('🔄 Syncing user to Convex:', args.clerkUserId, args.email);

		// Check if user already exists
		const existingUser = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (existingUser) {
			console.log('ℹ️  User already exists, updating records');
			// Update existing user
			await ctx.db.patch(existingUser._id, {
				email: args.email,
				name: args.name,
				updatedAt: Date.now(),
			});
		} else {
			// Create user record
			await ctx.db.insert('users', {
				clerkUserId: args.clerkUserId,
				email: args.email,
				name: args.name,
				createdAt: args.createdAt,
			});
			console.log('✅ User record created');
		}

		// Check if employee already exists
		const existingEmployee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (existingEmployee) {
			console.log('ℹ️  Employee already exists, updating records');
			// Update existing employee
			await ctx.db.patch(existingEmployee._id, {
				name: args.name,
				email: args.email,
				workEmail: args.email,
				role: args.role,
				locations: args.locations,
				assignedDeviceId: args.assignedDeviceId,
				updatedAt: Date.now(),
			});
		} else {
			// Check if this is the first user (should become admin)
			const existingAdmins = await ctx.db
				.query('roles')
				.filter((q) => q.eq(q.field('role'), 'admin'))
				.collect();

			const isFirstUser = existingAdmins.length === 0;

			// ✅ KEY FIX: Use metadata role if provided, fallback to first user logic
			const finalRole = isFirstUser ? 'admin' : args.role;
			const finalStatus = isFirstUser ? 'active' : 'active'; // All are active now

			console.log(
				`${isFirstUser ? '🎖️  First user - creating admin' : '👤 Creating employee'}`
			);

			await ctx.db.insert('employees', {
				name: args.name,
				workEmail: args.email,
				email: args.email,
				clerkUserId: args.clerkUserId,
				role: finalRole,
				locations: args.locations || [],
				employmentStatus: finalStatus,
				assignedDeviceId: args.assignedDeviceId || undefined,
				createdAt: Date.now(),
				onboardedAt: Date.now(),
			});

			console.log('✅ Employee record created');
		}

		// Check if role exists
		const existingRole = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (existingRole) {
			console.log('ℹ️  Role already exists, updating');
			await ctx.db.patch(existingRole._id, {
				role: args.role,
				locations: args.locations,
				assignedAt: Date.now(),
			});
		} else {
			// Create role
			const existingAdmins = await ctx.db
				.query('roles')
				.filter((q) => q.eq(q.field('role'), 'admin'))
				.collect();
			const isFirstUser = existingAdmins.length === 0;
			const finalRole = isFirstUser ? 'admin' : args.role;

			await ctx.db.insert('roles', {
				clerkUserId: args.clerkUserId,
				role: finalRole,
				locations: args.locations || [],
				assignedAt: Date.now(),
			});

			console.log(`✅ Role created: ${finalRole}`);
		}

		return {success: true};
	},
});

/**
 * Internal mutation: Update user from Clerk
 * ✅ FIXED: Now updates role/locations/device from metadata
 */
export const updateUserFromClerk = internalMutation({
	args: {
		clerkUserId: v.string(),
		email: v.string(),
		name: v.string(),
		role: v.optional(
			v.union(v.literal('admin'), v.literal('supervisor'), v.literal('staff'))
		),
		locations: v.optional(v.array(v.string())) || [],
		assignedDeviceId: v.optional(v.string()) || undefined,
	},
	handler: async (ctx, args) => {
		console.log('🔄 Updating user:', args.clerkUserId);

		const user = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (user) {
			await ctx.db.patch(user._id, {
				email: args.email,
				name: args.name,
				updatedAt: Date.now(),
			});
		}

		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (employee) {
			const updates: any = {
				name: args.name,
				email: args.email,
				workEmail: args.email,
				updatedAt: Date.now(),
			};

			// Update role/locations/device if provided in metadata
			if (args.role !== undefined) updates.role = args.role;
			if (args.locations !== undefined) updates.locations = args.locations;
			if (args.assignedDeviceId !== undefined)
				updates.assignedDeviceId = args.assignedDeviceId;

			await ctx.db.patch(employee._id, updates);
		}

		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (role && args.role !== undefined && args.locations !== undefined) {
			await ctx.db.patch(role._id, {
				role: args.role,
				locations: args.locations,
			});
		}

		console.log('✅ User updated');
		return {success: true};
	},
});

/**
 * Internal mutation: Delete user from Clerk
 */
export const deleteUserFromClerk = internalMutation({
	args: {
		clerkUserId: v.string(),
	},
	handler: async (ctx, args) => {
		console.log('🗑️  Deleting user from Convex:', args.clerkUserId);

		const user = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (user) {
			await ctx.db.delete(user._id);
			console.log('✅ User record deleted');
		}

		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (employee) {
			await ctx.db.delete(employee._id);
			console.log('✅ Employee record deleted');
		}

		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (role) {
			await ctx.db.delete(role._id);
			console.log('✅ Role record deleted');
		}

		return {success: true};
	},
});
