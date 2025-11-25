// import {db} from '../index';
// import {devices} from '../schema';
// import {eq, and} from 'drizzle-orm';

// export async function getDeviceByDeviceId(deviceId: string) {
// 	return await db.query.devices.findFirst({
// 		where: eq(devices.deviceId, deviceId),
// 	});
// }

// export async function listDevices(location?: string) {
// 	if (location) {
// 		return await db.query.devices.findMany({
// 			where: eq(devices.location, location),
// 			orderBy: (devices, {desc}) => [desc(devices.registeredAt)],
// 		});
// 	}
// 	return await db.query.devices.findMany({
// 		orderBy: (devices, {desc}) => [desc(devices.registeredAt)],
// 	});
// }

// export async function listActiveDevices() {
// 	return await db.query.devices.findMany({
// 		where: eq(devices.isActive, true),
// 		orderBy: (devices, {desc}) => [desc(devices.registeredAt)],
// 	});
// }

// export async function getDeviceById(id: string) {
// 	return await db.query.devices.findFirst({
// 		where: eq(devices.id, id),
// 	});
// }


// src/db/queries/devices.ts

import {db} from '../index';
import {devices} from '../schema';
import {eq, desc} from 'drizzle-orm';
import {getUserRoleDoc} from '@/lib/db-helpers';

// Helper: Check admin access for queries (no audit logging)
async function requireAdminQuery(clerkUserId: string) {
    const userRole = await getUserRoleDoc(clerkUserId);
    if (!userRole || userRole.role !== 'admin') {
        throw new Error('Admin access required');
    }
    return userRole;
}

// Query: List all devices (admin only)
export async function listDevices(clerkUserId: string, location?: string) {
    await requireAdminQuery(clerkUserId);

    let devicesList;

    if (location) {
        devicesList = await db.query.devices.findMany({
            where: eq(devices.location, location),
            orderBy: [desc(devices.registeredAt)],
        });
    } else {
        devicesList = await db.query.devices.findMany({
            orderBy: [desc(devices.registeredAt)],
        });
    }

    return devicesList.map((device) => ({
        id: device.id,
        deviceId: device.deviceId,
        deviceName: device.deviceName,
        location: device.location,
        deviceType: device.deviceType || 'desktop',
        isActive: device.isActive,
        registeredAt: device.registeredAt,
        registeredBy: device.registeredBy,
        lastUsedAt: device.lastUsedAt,
        lastUsedBy: device.lastUsedBy,
        metadata: device.metadata,
        notes: device.notes,
    }));
}

// Query: Check if a device is registered and active
// Admins can bypass device restrictions
export async function checkDevice(clerkUserId: string | null, deviceId: string) {
    // Check if current user is admin - admins can login from any device
    if (clerkUserId) {
        const userRole = await getUserRoleDoc(clerkUserId);
        
        if (userRole?.role === 'admin') {
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
    const device = await db.query.devices.findFirst({
        where: eq(devices.deviceId, deviceId),
    });

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
}

// Query: Get device by deviceId
export async function getDeviceByDeviceId(deviceId: string) {
    return await db.query.devices.findFirst({
        where: eq(devices.deviceId, deviceId),
    });
}

// Query: Get device by ID
export async function getDeviceById(id: string) {
    return await db.query.devices.findFirst({
        where: eq(devices.id, id),
    });
}