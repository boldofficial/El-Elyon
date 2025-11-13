// convex/admin.ts

import {v} from 'convex/values';
import {mutation, query} from './_generated/server';
import {Doc} from './_generated/dataModel';

// ============================================================================
// ADMIN ROLE MANAGEMENT
// ============================================================================

/**
 * Check if any admin exists in the system
 */
export const hasAdminUser = query({
	args: {},
	handler: async (ctx) => {
		const adminRole = await ctx.db
			.query('roles')
			.filter((q) => q.eq(q.field('role'), 'admin'))
			.first();

		console.log('🔍 hasAdminUser:', adminRole !== null);
		return adminRole !== null;
	},
});

/**
 * Create the first admin user (only works if no admin exists)
 */
export const createFirstAdmin = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}
		const clerkUserId = identity.subject;
		console.log('🔐 Creating first admin for:', clerkUserId);

		// Check if any admin already exists
		const existingAdmin = await ctx.db
			.query('roles')
			.filter((q) => q.eq(q.field('role'), 'admin'))
			.first();

		if (existingAdmin) {
			throw new Error('An admin user already exists');
		}

		// Check if employee record exists
		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		// Create employee record if it doesn't exist
		if (!employee) {
			console.log('📝 Creating employee record for first admin');
			await ctx.db.insert('employees', {
				name: identity.name || identity.email || 'Admin User',
				workEmail: identity.email || 'admin@example.com',
				email: identity.email || 'admin@example.com',
				clerkUserId,
				role: 'admin',
				locations: [],
				employmentStatus: 'active',
				assignedDeviceId: undefined, // Admin can login from anywhere (changed from null to undefined)
				createdAt: Date.now(),
			});
		}

		// Create admin role
		await ctx.db.insert('roles', {
			clerkUserId,
			role: 'admin',
			locations: [],
			assignedAt: Date.now(),
		});

		// Create admin user
		await ctx.db.insert('users', {
			clerkUserId,
			email: identity.email || 'admin@example.com',
			name: identity.name || 'Admin User',
			// role: 'admin',
			createdAt: Date.now(),
		});

		console.log('✅ First admin created successfully');
		return {success: true};
	},
});

/**
 * EMERGENCY: Force create admin for current user
 * Use this if you're locked out
 */
export const forceCreateAdmin = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}
		const clerkUserId = identity.subject;

		console.log('🚨 FORCE ADMIN for:', clerkUserId, identity.email);

		// Create or update employee record
		const existingEmployee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		if (existingEmployee) {
			console.log('📝 Updating existing employee to admin');
			await ctx.db.patch(existingEmployee._id, {
				role: 'admin',
				assignedDeviceId: undefined, // Allow login from anywhere (changed from null to undefined)
			});
		} else {
			console.log('📝 Creating new employee record as admin');
			await ctx.db.insert('employees', {
				name: identity.name || identity.email || 'Admin User',
				workEmail: identity.email || 'admin@example.com',
				email: identity.email || 'admin@example.com',
				clerkUserId,
				role: 'admin',
				locations: [],
				employmentStatus: 'active',
				assignedDeviceId: undefined, // Allow login from anywhere (changed from null to undefined)
				createdAt: Date.now(),
			});
		}

		// Create or update role
		const existingRole = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		if (existingRole) {
			console.log('🔧 Updating existing role to admin');
			await ctx.db.patch(existingRole._id, {
				role: 'admin',
				locations: [],
				assignedAt: Date.now(),
			});
		} else {
			console.log('➕ Creating new admin role');
			await ctx.db.insert('roles', {
				clerkUserId,
				role: 'admin',
				locations: [],
				assignedAt: Date.now(),
			});
		}

		console.log('✅ Force admin creation complete!');
		return {
			success: true,
			message: 'You are now an admin! Refresh the page.',
			clerkUserId,
		};
	},
});

// ============================================================================
// KIOSK DEVICE MANAGEMENT
// ============================================================================

/**
 * Seed kiosk devices for all locations
 * Run this once after initial setup
 */
export const seedKioskDevices = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
			.first();

		if (!role || role.role !== 'admin') {
			throw new Error('Admin access required');
		}

		console.log('🏢 Seeding kiosk devices for all locations...');

		const locations = [
			'Rose of sharon',
			'Meta B',
			'Meta A',
			'Meta C',
			'Meta D',
			'Meta E',
			'Bread of Live',
		];

		const createdDevices = [];
		const skippedDevices = [];

		for (const location of locations) {
			// Check if device already exists for this location
			const existing = await ctx.db
				.query('kiosks')
				.withIndex('by_location', (q) => q.eq('location', location))
				.first();

			if (existing) {
				console.log(`⏭️  Device already exists for ${location}, skipping...`);
				skippedDevices.push(location);
				continue;
			}

			// Generate unique device ID
			const deviceId = `kiosk_${location.toLowerCase().replace(/\s+/g, '_')}_${Date.now().toString(36)}`;

			const kioskId = await ctx.db.insert('kiosks', {
				name: `${location} Kiosk`,
				location: location,
				deviceId: deviceId,
				deviceLabel: `${location} - Front Desk Laptop`,
				status: 'active',
				registeredAt: Date.now(),
				registeredBy: identity.subject,
				createdAt: Date.now(),
				createdBy: identity.subject,
			});

			createdDevices.push({
				kioskId,
				location,
				deviceId,
			});

			console.log(`✅ Created kiosk for ${location}: ${deviceId}`);
		}

		console.log(
			`🎉 Seeding complete! Created: ${createdDevices.length}, Skipped: ${skippedDevices.length}`
		);

		return {
			success: true,
			message: `Created ${createdDevices.length} kiosk device(s). Skipped ${skippedDevices.length} existing.`,
			created: createdDevices,
			skipped: skippedDevices,
		};
	},
});

/**
 * List all kiosk devices (optionally filter by location)
 */
export const listKioskDevices = query({
	args: {
		location: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
			.first();

		if (!role || role.role !== 'admin') {
			throw new Error('Admin access required');
		}

		let kiosks;
		if (args.location) {
			kiosks = await ctx.db
				.query('kiosks')
				.withIndex('by_location', (q) => q.eq('location', args.location!)) // Assert args.location as string
				.collect();
		} else {
			kiosks = await ctx.db.query('kiosks').collect();
		}

		console.log(`📱 Found ${kiosks.length} kiosk device(s)`);

		return kiosks.map((k) => ({
			id: k._id,
			deviceId: k.deviceId,
			location: k.location,
			deviceLabel: k.deviceLabel || k.name,
			status: k.status,
			registeredAt: k.registeredAt,
		}));
	},
});

// ============================================================================
// LOCATION MANAGEMENT
// ============================================================================

/**
 * Get all locations
 */
export const getLocations = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}

		const userRole = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
			.first();

		if (!userRole || userRole.role !== 'admin') {
			throw new Error('Unauthorized');
		}

		return await ctx.db.query('locations').collect();
	},
});

// Alias for backward compatibility
export const listLocations = getLocations;

/**
 * Sync locations from string array (creates locations table from string array)
 */
export const syncLocationsFromStrings = mutation({
	args: {
		locationNames: v.array(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;

		const clerkUserId = identity.subject;
		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();
		const userRole = role;

		// console.log('what is my user role?::', userRole);
		console.log('what is my user role role?::', userRole?.role);

		if (!userRole || userRole.role !== 'admin') {
			throw new Error('Unauthorized');
		}

		console.log('🏢 Syncing locations:', args.locationNames);

		const existingLocations: Doc<'locations'>[] = await ctx.db
			.query('locations')
			.collect();
		const existingNames = new Set(existingLocations.map((l) => l.name));

		let created = 0;
		for (const name of args.locationNames) {
			if (!existingNames.has(name)) {
				await ctx.db.insert('locations', {
					name,
					status: 'active',
					createdBy: identity.subject,
					createdAt: Date.now(),
				});
				console.log(`✅ Created location: ${name}`);
				created++;
			}
		}

		console.log(
			`🎉 Location sync complete! Created: ${created}, Existing: ${existingNames.size}`
		);

		return {success: true, created, existing: existingNames.size};
	},
});

/**
 * Create a new location
 */
export const createLocation = mutation({
	args: {
		name: v.string(),
		address: v.optional(v.string()),
		capacity: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}

		const userRole = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
			.first();

		if (!userRole || userRole.role !== 'admin') {
			throw new Error('Unauthorized');
		}

		const locationId = await ctx.db.insert('locations', {
			name: args.name,
			address: args.address,
			capacity: args.capacity,
			status: 'active',
			createdBy: identity.subject,
			createdAt: Date.now(),
		});

		console.log(`✅ Created location: ${args.name} (${locationId})`);

		return locationId;
	},
});

/**
 * Update a location
 */
export const updateLocation = mutation({
	args: {
		locationId: v.id('locations'),
		name: v.string(),
		address: v.optional(v.string()),
		capacity: v.optional(v.number()),
		status: v.union(v.literal('active'), v.literal('inactive')),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}

		const userRole = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
			.first();

		if (!userRole || userRole.role !== 'admin') {
			throw new Error('Unauthorized');
		}

		await ctx.db.patch(args.locationId, {
			name: args.name,
			address: args.address,
			capacity: args.capacity,
			status: args.status,
			updatedAt: Date.now(),
		});

		console.log(`✅ Updated location: ${args.name}`);

		return {success: true};
	},
});

/**
 * Delete a location
 */
export const deleteLocation = mutation({
	args: {
		locationId: v.id('locations'),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}

		const userRole = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
			.first();

		if (!userRole || userRole.role !== 'admin') {
			throw new Error('Unauthorized');
		}

		const location = await ctx.db.get(args.locationId);
		if (!location) {
			throw new Error('Location not found');
		}

		// Check if location is in use
		const residentsInLocation = await ctx.db
			.query('residents')
			.withIndex('by_location', (q) => q.eq('location', location.name))
			.first();

		if (residentsInLocation) {
			throw new Error('Cannot delete location with residents');
		}

		await ctx.db.delete(args.locationId);
		console.log(`🗑️  Deleted location: ${location.name}`);

		return {success: true};
	},
});

/**
 * Get recent logs for admin dashboard
 */
export const getRecentLogsForAdmin = query({
	args: {limit: v.number()},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}

		const userRole = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', identity.subject))
			.first();

		if (!userRole || userRole.role !== 'admin') {
			throw new Error('Unauthorized');
		}

		return await ctx.db.query('resident_logs').order('desc').take(args.limit);
	},
});
