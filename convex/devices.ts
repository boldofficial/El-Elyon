import {v} from 'convex/values';
import {mutation, query} from './_generated/server';

// Register a new device
export const registerDevice = mutation({
	args: {
		deviceId: v.string(), // Browser fingerprint
		deviceName: v.string(),
		location: v.string(),
		deviceType: v.optional(
			v.union(v.literal('kiosk'), v.literal('mobile'), v.literal('desktop'))
		),
		metadata: v.optional(
			v.object({
				browser: v.optional(v.string()),
				os: v.optional(v.string()),
				screenResolution: v.optional(v.string()),
				ipAddress: v.optional(v.string()),
			})
		),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
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
			throw new Error('Only admins can register devices');
		}

		// Check if device already exists
		const existingDevice = await ctx.db
			.query('devices')
			.withIndex('by_deviceId', (q) => q.eq('deviceId', args.deviceId))
			.first();

		if (existingDevice) {
			throw new Error('Device already registered');
		}

		// Create the device
		const deviceId = await ctx.db.insert('devices', {
			deviceId: args.deviceId,
			deviceName: args.deviceName,
			location: args.location,
			isActive: true,
			deviceType: args.deviceType || 'desktop',
			registeredBy: clerkUserId,
			registeredAt: Date.now(),
			metadata: args.metadata,
			notes: args.notes,
		});

		// Log the registration
		await ctx.db.insert('audit_logs', {
			clerkUserId: clerkUserId,
			event: 'device_registered',
			timestamp: Date.now(),
			deviceId: args.deviceId,
			location: args.location,
			details: `Registered device: ${args.deviceName}`,
		});

		return {success: true, deviceId};
	},
});

// Check if a device is registered and active
// Returns bypass info for admins who can login from anywhere
export const checkDevice = query({
	args: {
		deviceId: v.string(),
	},
	handler: async (ctx, args) => {
		// Check if current user is admin
		const identity = await ctx.auth.getUserIdentity();
		if (identity) {
			const role = await ctx.db
				.query('roles')
				.withIndex('by_clerkUserId', (q) =>
					q.eq('clerkUserId', identity.subject)
				)
				.first();

			// Admins can login from any device
			if (role?.role === 'admin') {
				return {
					isRegistered: true,
					isActive: true,
					isAdmin: true,
					deviceName: 'Admin Device (unrestricted)',
					location: 'Any Location',
					message: 'Admin access granted from any device',
				};
			}
		}

		// For non-admins, check device registration
		const device = await ctx.db
			.query('devices')
			.withIndex('by_deviceId', (q) => q.eq('deviceId', args.deviceId))
			.first();

		if (!device) {
			return {
				isRegistered: false,
				isActive: false,
				isAdmin: false,
				message: 'Device not registered. Contact your administrator.',
			};
		}

		return {
			isRegistered: true,
			isActive: device.isActive,
			isAdmin: false,
			deviceName: device.deviceName,
			location: device.location,
			deviceType: device.deviceType,
			message: device.isActive
				? 'Device is active'
				: 'Device is inactive. Contact administrator.',
		};
	},
});

// Get all registered devices (admin only)
export const listDevices = query({
	args: {
		location: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
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
			throw new Error('Only admins can view devices');
		}

		// Get devices
		let devices;

		if (args.location) {
			// Use type assertion since we've already checked it's not undefined
			devices = await ctx.db
				.query('devices')
				.withIndex('by_location', (q) => q.eq('location', args.location!))
				.collect();
		} else {
			devices = await ctx.db.query('devices').collect();
		}

		// Sort by registration date (newest first)
		return devices.sort((a, b) => b.registeredAt - a.registeredAt);
	},
});

// Update device status (activate/deactivate)
export const updateDeviceStatus = mutation({
	args: {
		deviceId: v.string(),
		isActive: v.boolean(),
	},
	handler: async (ctx, args) => {
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
			throw new Error('Only admins can update devices');
		}

		// Find the device
		const device = await ctx.db
			.query('devices')
			.withIndex('by_deviceId', (q) => q.eq('deviceId', args.deviceId))
			.first();

		if (!device) {
			throw new Error('Device not found');
		}

		// Update the device
		await ctx.db.patch(device._id, {
			isActive: args.isActive,
		});

		// Log the change
		await ctx.db.insert('audit_logs', {
			clerkUserId: clerkUserId,
			event: args.isActive ? 'device_activated' : 'device_deactivated',
			timestamp: Date.now(),
			deviceId: args.deviceId,
			location: device.location,
			details: `${args.isActive ? 'Activated' : 'Deactivated'} device: ${device.deviceName}`,
		});

		return {success: true};
	},
});

// Delete a device
export const deleteDevice = mutation({
	args: {
		deviceId: v.string(),
	},
	handler: async (ctx, args) => {
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
			throw new Error('Only admins can delete devices');
		}

		// Find the device
		const device = await ctx.db
			.query('devices')
			.withIndex('by_deviceId', (q) => q.eq('deviceId', args.deviceId))
			.first();

		if (!device) {
			throw new Error('Device not found');
		}

		// Delete the device
		await ctx.db.delete(device._id);

		// Log the deletion
		await ctx.db.insert('audit_logs', {
			clerkUserId: clerkUserId,
			event: 'device_deleted',
			timestamp: Date.now(),
			deviceId: args.deviceId,
			location: device.location,
			details: `Deleted device: ${device.deviceName}`,
		});

		return {success: true};
	},
});

// Update device info
export const updateDevice = mutation({
	args: {
		deviceId: v.string(),
		deviceName: v.optional(v.string()),
		location: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
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
			throw new Error('Only admins can update devices');
		}

		// Find the device
		const device = await ctx.db
			.query('devices')
			.withIndex('by_deviceId', (q) => q.eq('deviceId', args.deviceId))
			.first();

		if (!device) {
			throw new Error('Device not found');
		}

		// Prepare update object
		const updates: any = {};
		if (args.deviceName !== undefined) updates.deviceName = args.deviceName;
		if (args.location !== undefined) updates.location = args.location;
		if (args.notes !== undefined) updates.notes = args.notes;

		// Update the device
		await ctx.db.patch(device._id, updates);

		// Log the update
		await ctx.db.insert('audit_logs', {
			clerkUserId: clerkUserId,
			event: 'device_updated',
			timestamp: Date.now(),
			deviceId: args.deviceId,
			location: device.location,
			details: `Updated device: ${device.deviceName}`,
		});

		return {success: true};
	},
});

// Record device usage (called when someone logs in)
export const recordDeviceUsage = mutation({
	args: {
		deviceId: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}
		const clerkUserId = identity.subject;

		// Find the device
		const device = await ctx.db
			.query('devices')
			.withIndex('by_deviceId', (q) => q.eq('deviceId', args.deviceId))
			.first();

		if (!device) {
			return {success: false, message: 'Device not registered'};
		}

		if (!device.isActive) {
			return {success: false, message: 'Device is inactive'};
		}

		// Update device last used info
		await ctx.db.patch(device._id, {
			lastUsedAt: Date.now(),
			lastUsedBy: clerkUserId,
		});

		// Update or create user record
		const user = await ctx.db
			.query('users')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		if (user) {
			// User exists - just update login info
			await ctx.db.patch(user._id, {
				lastLoginAt: Date.now(),
				lastLoginDeviceId: args.deviceId,
				lastLoginLocation: device.location,
				updatedAt: Date.now(),
			});
		} else {
			// User doesn't exist - create new record with employee info
			const employee = await ctx.db
				.query('employees')
				.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
				.first();

			await ctx.db.insert('users', {
				clerkUserId: clerkUserId,
				email:
					employee?.workEmail ||
					employee?.email ||
					identity.email ||
					'unknown@example.com',
				name: employee?.name || identity.name || 'Unknown User',
				lastLoginAt: Date.now(),
				lastLoginDeviceId: args.deviceId,
				lastLoginLocation: device.location,
				createdAt: Date.now(),
			});
		}

		return {
			success: true,
			deviceName: device.deviceName,
			location: device.location,
		};
	},
});
