import {db} from '../index';
import {devices} from '../schema';
import {eq, and} from 'drizzle-orm';

export async function getDeviceByDeviceId(deviceId: string) {
	return await db.query.devices.findFirst({
		where: eq(devices.deviceId, deviceId),
	});
}

export async function listDevices(location?: string) {
	if (location) {
		return await db.query.devices.findMany({
			where: eq(devices.location, location),
			orderBy: (devices, {desc}) => [desc(devices.registeredAt)],
		});
	}
	return await db.query.devices.findMany({
		orderBy: (devices, {desc}) => [desc(devices.registeredAt)],
	});
}

export async function listActiveDevices() {
	return await db.query.devices.findMany({
		where: eq(devices.isActive, true),
		orderBy: (devices, {desc}) => [desc(devices.registeredAt)],
	});
}

export async function getDeviceById(id: string) {
	return await db.query.devices.findFirst({
		where: eq(devices.id, id),
	});
}
