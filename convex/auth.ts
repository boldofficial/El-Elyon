import {query, action, internalMutation} from './_generated/server';
import {internal} from './_generated/api';
import {v} from 'convex/values';

/**
 * Self-Healing Authentication Query
 * Called on every login to ensure user exists in Convex
 * ✅ FIXED: Now fetches metadata from Clerk to restore full user data
 */
export const ensureUserExists = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const clerkUserId = identity.subject;
		const email = identity.email || '';
		const name = identity.name || email.split('@')[0] || 'User';

		console.log('🔍 Checking if user exists:', clerkUserId, email);

		// Check if user exists in users table
		const user = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		// Check if employee record exists
		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		// Check if role exists
		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		// If all records exist, user is fully synced
		if (user && employee && role) {
			console.log('✅ User exists with role:', role.role);
			return {
				exists: true,
				clerkUserId,
				email,
				name,
				role: role.role,
				locations: role.locations || employee.locations || [],
				employmentStatus: employee.employmentStatus,
				needsSync: false,
			};
		}

		// User is missing some records - needs sync
		console.log(
			'⚠️  User incomplete:',
			'user=' + !!user,
			'employee=' + !!employee,
			'role=' + !!role
		);

		return {
			exists: false,
			clerkUserId,
			email,
			name,
			needsSync: true,
		};
	},
});

/**
 * Get currently logged-in user with full details
 * Returns user info, role, and employee data
 */
export const loggedInUser = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const clerkUserId = identity.subject;

		// Fetch all user data in parallel
		const [user, employee, role] = await Promise.all([
			ctx.db
				.query('users')
				.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
				.first(),
			ctx.db
				.query('employees')
				.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
				.first(),
			ctx.db
				.query('roles')
				.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
				.first(),
		]);

		if (!user || !employee || !role) {
			console.log('⚠️ Logged-in user missing records - needs sync');
			return null;
		}

		return {
			_id: user._id,
			clerkUserId: user.clerkUserId,
			email: user.email,
			name: user.name,
			role: role.role,
			locations: role.locations || employee.locations || [],
			employmentStatus: employee.employmentStatus,
			assignedDeviceId: employee.assignedDeviceId,
			employeeId: employee._id,
		};
	},
});

/**
 * Update logged-in user's profile information
 * Updates user, employee, and syncs with Clerk
 */
export const updateUserProfile = action({
	args: {
		name: v.optional(v.string()),
		email: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		const clerkUserId = identity.subject;

		console.log('🔄 Updating user profile:', clerkUserId, args);

		// Update Clerk user first (if email is being changed)
		if (args.email) {
			try {
				await ctx.runAction(internal.clerkActions.updateClerkUser, {
					userId: clerkUserId,
					email: args.email,
				});
				console.log('✅ Clerk user updated');
			} catch (error) {
				console.error('❌ Failed to update Clerk user:', error);
				throw new Error('Failed to update email in authentication system');
			}
		}

		// Update local database records
		await ctx.runMutation(internal.auth.updateUserRecords, {
			clerkUserId,
			name: args.name,
			email: args.email,
		});

		console.log('✅ User profile updated successfully');

		return {success: true};
	},
});

/**
 * Internal mutation: Update user records (called by updateUserProfile)
 */
export const updateUserRecords = internalMutation({
	args: {
		clerkUserId: v.string(),
		name: v.optional(v.string()),
		email: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const updates: any = {
			updatedAt: Date.now(),
		};

		if (args.name) updates.name = args.name;
		if (args.email) {
			updates.email = args.email;
			updates.workEmail = args.email;
		}

		// Update user record
		const user = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (user) {
			await ctx.db.patch(user._id, {
				...(args.name && {name: args.name}),
				...(args.email && {email: args.email}),
				updatedAt: Date.now(),
			});
			console.log('✅ User record updated');
		}

		// Update employee record
		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (employee) {
			await ctx.db.patch(employee._id, {
				...(args.name && {name: args.name}),
				...(args.email && {email: args.email, workEmail: args.email}),
				updatedAt: Date.now(),
			});
			console.log('✅ Employee record updated');
		}

		return {success: true};
	},
});

/**
 * Action: Auto-create missing user records
 * ✅ Changed to ACTION (not mutation) because we need to call getClerkUserById
 * Called when user logs in but doesn't exist in database
 */
export const autoSyncUser = action({
	args: {},
	handler: async (
		ctx
	): Promise<{
		success: boolean;
		isFirstAdmin: boolean;
		role: 'admin' | 'supervisor' | 'staff';
		locations: string[];
	}> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		const clerkUserId = identity.subject;
		const email = identity.email || '';
		const name = identity.name || email.split('@')[0] || 'User';

		console.log('🔄 Auto-syncing user:', clerkUserId, email);

		// ✅ KEY FIX: Fetch full user data from Clerk API (includes metadata)
		let clerkUserData: {
			id: string;
			email: string | undefined;
			name: string;
			metadata: Record<string, any>;
		};

		try {
			clerkUserData = await ctx.runAction(
				internal.clerkActions.getClerkUserById,
				{
					id: clerkUserId,
				}
			);
			console.log('✅ Fetched Clerk user data:', clerkUserData);
		} catch (error) {
			console.error('❌ Failed to fetch Clerk user:', error);
			// Fallback to basic data if Clerk API fails
			clerkUserData = {
				id: clerkUserId,
				email,
				name,
				metadata: {},
			};
		}

		// Extract metadata (role, locations, device)
		const metadata = clerkUserData.metadata || {};
		const role: 'admin' | 'supervisor' | 'staff' = metadata.role || 'staff';
		const locations: string[] = metadata.locations || [];
		const assignedDeviceId: string | undefined = metadata.assignedDeviceId;

		console.log('📋 Metadata:', {role, locations, assignedDeviceId});

		// Check if this is the first user (should become admin)
		const existingAdmins: Array<{role?: string}> = await ctx.runQuery(
			internal.employees.checkForAdmins,
			{}
		);

		const isFirstUser: boolean = existingAdmins.length === 0;
		const finalRole: 'admin' | 'supervisor' | 'staff' = isFirstUser
			? 'admin'
			: role;
		const finalStatus = isFirstUser ? 'active' : 'active';

		console.log(
			`${isFirstUser ? '🎖️  First user - creating admin' : '👤 Restoring user with role: ' + finalRole}`
		);

		// Call internal mutation to create records
		await ctx.runMutation(internal.auth.createUserRecords, {
			clerkUserId,
			email,
			name,
			role: finalRole,
			locations,
			assignedDeviceId,
			employmentStatus: finalStatus,
		});

		console.log('✅ User sync complete');

		return {
			success: true,
			isFirstAdmin: isFirstUser,
			role: finalRole,
			locations,
		};
	},
});

/**
 * Internal mutation: Create user records (called by autoSyncUser)
 * ✅ Changed to internalMutation (not exported mutation)
 */
export const createUserRecords = internalMutation({
	args: {
		clerkUserId: v.string(),
		email: v.string(),
		name: v.string(),
		role: v.union(
			v.literal('admin'),
			v.literal('supervisor'),
			v.literal('staff')
		),
		locations: v.array(v.string()),
		assignedDeviceId: v.optional(v.string()),
		employmentStatus: v.string(),
	},
	handler: async (ctx, args) => {
		// Create user record if missing
		const existingUser = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (!existingUser) {
			await ctx.db.insert('users', {
				clerkUserId: args.clerkUserId,
				email: args.email,
				name: args.name,
				createdAt: Date.now(),
			});
			console.log('✅ User record created');
		} else {
			// Update existing user
			await ctx.db.patch(existingUser._id, {
				email: args.email,
				name: args.name,
				updatedAt: Date.now(),
			});
			console.log('✅ User record updated');
		}

		// Create employee record if missing
		const existingEmployee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (!existingEmployee) {
			await ctx.db.insert('employees', {
				name: args.name,
				workEmail: args.email,
				email: args.email,
				clerkUserId: args.clerkUserId,
				role: args.role,
				locations: args.locations,
				employmentStatus: args.employmentStatus,
				assignedDeviceId: args.assignedDeviceId,
				createdAt: Date.now(),
				onboardedAt: Date.now(),
			});
			console.log(`✅ Employee record created (${args.role})`);
		} else {
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
			console.log(`✅ Employee record updated (${args.role})`);
		}

		// Create role if missing
		const existingRole = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();

		if (!existingRole) {
			await ctx.db.insert('roles', {
				clerkUserId: args.clerkUserId,
				role: args.role,
				locations: args.locations,
				assignedAt: Date.now(),
			});
			console.log(`✅ Role created: ${args.role}`);
		} else {
			// Update existing role
			await ctx.db.patch(existingRole._id, {
				role: args.role,
				locations: args.locations,
			});
			console.log(`✅ Role updated: ${args.role}`);
		}

		return {success: true};
	},
});
