// // src/db/mutations/devices.ts
// import {db} from '../index';
// import {devices, auditLogs, users} from '../schema';
// import {eq} from 'drizzle-orm';
// import {getDeviceByDeviceId} from '../queries/devices';
// import {getUserByClerkId} from '../queries/users';
// // import {logAudit} from '@/lib/db-helpers';
// import {getEmployeeByClerkId} from '../queries/employees';

// export async function registerDevice(args: {
// 	deviceId: string;
// 	deviceName: string;
// 	location: string;
// 	deviceType: 'kiosk' | 'mobile' | 'desktop';
// 	registeredBy: string;
// 	metadata?: {
// 		browser?: string;
// 		os?: string;
// 		screenResolution?: string;
// 		ipAddress?: string;
// 	};
// 	notes?: string;
// }) {
// 	// Check if device already exists
// 	const existingDevice = await getDeviceByDeviceId(args.deviceId);
// 	if (existingDevice) {
// 		throw new Error('Device already registered');
// 	}

// 	const [newDevice] = await db
// 		.insert(devices)
// 		.values({
// 			deviceId: args.deviceId,
// 			deviceName: args.deviceName,
// 			location: args.location,
// 			isActive: true,
// 			deviceType: args.deviceType,
// 			registeredBy: args.registeredBy,
// 			registeredAt: new Date(),
// 			metadata: args.metadata,
// 			notes: args.notes,
// 		})
// 		.returning();

// 	// Log the registration
// 	await db.insert(auditLogs).values({
// 		clerkUserId: args.registeredBy,
// 		event: 'device_registered',
// 		timestamp: new Date(),
// 		deviceId: args.deviceId,
// 		location: args.location,
// 		details: `Registered device: ${args.deviceName}`,
// 	});

// 	console.log('✅ Device registered:', args.deviceName);
// 	return newDevice;
// }

// export async function updateDeviceStatus(
// 	deviceId: string,
// 	isActive: boolean,
// 	clerkUserId: string
// ) {
// 	const device = await getDeviceByDeviceId(deviceId);

// 	if (!device) {
// 		throw new Error('Device not found');
// 	}

// 	await db
// 		.update(devices)
// 		.set({
// 			isActive,
// 		})
// 		.where(eq(devices.deviceId, deviceId));

// 	// Log the change
// 	await db.insert(auditLogs).values({
// 		clerkUserId,
// 		event: isActive ? 'device_activated' : 'device_deactivated',
// 		timestamp: new Date(),
// 		deviceId,
// 		location: device.location,
// 		details: `${isActive ? 'Activated' : 'Deactivated'} device: ${device.deviceName}`,
// 	});

// 	return {success: true};
// }

// export async function updateDevice(
// 	deviceId: string,
// 	updates: {
// 		deviceName?: string;
// 		location?: string;
// 		notes?: string;
// 	},
// 	clerkUserId: string
// ) {
// 	const device = await getDeviceByDeviceId(deviceId);

// 	if (!device) {
// 		throw new Error('Device not found');
// 	}

// 	await db.update(devices).set(updates).where(eq(devices.deviceId, deviceId));

// 	// Log the update
// 	await db.insert(auditLogs).values({
// 		clerkUserId,
// 		event: 'device_updated',
// 		timestamp: new Date(),
// 		deviceId,
// 		location: device.location,
// 		details: `Updated device: ${device.deviceName}`,
// 	});

// 	return {success: true};
// }

// export async function deleteDevice(deviceId: string, clerkUserId: string) {
// 	const device = await getDeviceByDeviceId(deviceId);

// 	if (!device) {
// 		throw new Error('Device not found');
// 	}

// 	await db.delete(devices).where(eq(devices.deviceId, deviceId));

// 	// Log the deletion
// 	await db.insert(auditLogs).values({
// 		clerkUserId,
// 		event: 'device_deleted',
// 		timestamp: new Date(),
// 		deviceId,
// 		location: device.location,
// 		details: `Deleted device: ${device.deviceName}`,
// 	});

// 	return {success: true};
// }

// export async function recordDeviceUsage(deviceId: string, clerkUserId: string) {
// 	const device = await getDeviceByDeviceId(deviceId);

// 	if (!device) {
// 		return {success: false, message: 'Device not registered'};
// 	}

// 	if (!device || !device.isActive) {
// 		return {success: false, message: 'Device is inactive'};
// 	}

// 	// Update device last used info
// 	await db
// 		.update(devices)
// 		.set({
// 			lastUsedAt: new Date(),
// 			lastUsedBy: clerkUserId,
// 		})
// 		.where(eq(devices.deviceId, deviceId));

// 	// Update or create user record
// 	const user = await getUserByClerkId(clerkUserId);

// 	if (user) {
// 		// User exists - just update login info
// 		await db
// 			.update(users)
// 			.set({
// 				lastLoginAt: new Date(),
// 				lastLoginDeviceId: deviceId,
// 				lastLoginLocation: device.location,
// 				updatedAt: new Date(),
// 			})
// 			.where(eq(users.clerkUserId, clerkUserId));
// 	} else {
// 		// Create user if doesn't exist
// 		const employee = await getEmployeeByClerkId(clerkUserId);
// 		await db.insert(users).values({
// 			clerkUserId: clerkUserId,
// 			email: employee?.email || employee?.workEmail || 'unknown@example.com',
// 			name: employee?.name || 'Unknown User',
// 			lastLoginAt: new Date(),
// 			lastLoginDeviceId: deviceId,
// 			lastLoginLocation: device.location,
// 			createdAt: new Date(),
// 		});
// 	}

// 	console.log('✅ Device usage recorded');
// 	return {
// 		success: true,
// 		deviceName: device.deviceName,
// 		location: device.location,
// 	};
// }

// // ==========
// // on-off
// // ==========

// src/db/mutations/devices.ts

import {db} from '../index';
import {devices, users, employees} from '../schema';
import {eq} from 'drizzle-orm';

interface RegisterDeviceArgs {
	deviceId: string;
	deviceName: string;
	location: string;
	deviceType?: 'kiosk' | 'mobile' | 'desktop';
	metadata?: {
		browser?: string;
		os?: string;
		screenResolution?: string;
		ipAddress?: string;
	};
	notes?: string;
	registeredBy: string;
}

// Mutation: Register a new device
export async function registerDevice(args: RegisterDeviceArgs) {
	const [device] = await db
		.insert(devices)
		.values({
			deviceId: args.deviceId,
			deviceName: args.deviceName,
			location: args.location,
			isActive: true,
			deviceType: args.deviceType || 'desktop',
			registeredBy: args.registeredBy,
			registeredAt: new Date(),
			metadata: args.metadata,
			notes: args.notes,
		})
		.returning();

	return device;
}

// Mutation: Update device status (activate/deactivate)
export async function updateDeviceStatus(deviceId: string, isActive: boolean) {
	// Find the device first
	const device = await db.query.devices.findFirst({
		where: eq(devices.deviceId, deviceId),
	});

	if (!device) {
		throw new Error('Device not found');
	}

	const [updated] = await db
		.update(devices)
		.set({isActive})
		.where(eq(devices.deviceId, deviceId))
		.returning();

	return updated;
}

// Mutation: Update device by internal ID
export async function updateDeviceById(
	id: string,
	data: {
		deviceName?: string;
		location?: string;
		isActive?: boolean;
		notes?: string;
	}
) {
	const [updated] = await db
		.update(devices)
		.set(data)
		.where(eq(devices.id, id))
		.returning();

	return updated;
}

// Mutation: Delete device by deviceId
export async function deleteDeviceByDeviceId(deviceId: string) {
	// Find the device first
	const device = await db.query.devices.findFirst({
		where: eq(devices.deviceId, deviceId),
	});

	if (!device) {
		throw new Error('Device not found');
	}

	await db.delete(devices).where(eq(devices.deviceId, deviceId));

	return device;
}

// Mutation: Delete device by internal ID
export async function deleteDeviceById(id: string) {
	await db.delete(devices).where(eq(devices.id, id));
}

// Mutation: Update device info
export async function updateDevice(
	deviceId: string,
	data: {
		deviceName?: string;
		location?: string;
		notes?: string;
	}
) {
	const device = await db.query.devices.findFirst({
		where: eq(devices.deviceId, deviceId),
	});

	if (!device) {
		throw new Error('Device not found');
	}

	const [updated] = await db
		.update(devices)
		.set(data)
		.where(eq(devices.deviceId, deviceId))
		.returning();

	return updated;
}

// Mutation: Record device usage (called when someone logs in)
export async function recordDeviceUsage(
	deviceId: string,
	clerkUserId: string,
	userEmail?: string,
	userName?: string
) {
	// Find the device
	const device = await db.query.devices.findFirst({
		where: eq(devices.deviceId, deviceId),
	});

	if (!device) {
		return {success: false, message: 'Device not registered'};
	}

	if (!device.isActive) {
		return {success: false, message: 'Device is inactive'};
	}

	// Update device last used info
	await db
		.update(devices)
		.set({
			lastUsedAt: new Date(),
			lastUsedBy: clerkUserId,
		})
		.where(eq(devices.deviceId, deviceId));

	// Update or create user record
	const user = await db.query.users.findFirst({
		where: eq(users.clerkUserId, clerkUserId),
	});

	if (user) {
		// User exists - just update login info
		await db
			.update(users)
			.set({
				lastLoginAt: new Date(),
				lastLoginDeviceId: deviceId,
				lastLoginLocation: device.location,
				updatedAt: new Date(),
			})
			.where(eq(users.clerkUserId, clerkUserId));
	} else {
		// User doesn't exist - create new record with employee info
		const employee = await db.query.employees.findFirst({
			where: eq(employees.clerkUserId, clerkUserId),
		});

		await db.insert(users).values({
			clerkUserId: clerkUserId,
			email:
				employee?.workEmail ||
				employee?.email ||
				userEmail ||
				'unknown@example.com',
			name: employee?.name || userName || 'Unknown User',
			lastLoginAt: new Date(),
			lastLoginDeviceId: deviceId,
			lastLoginLocation: device.location,
			createdAt: new Date(),
		});
	}

	return {
		success: true,
		deviceName: device.deviceName,
		location: device.location,
	};
}
