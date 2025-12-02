import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {getDeviceById} from '@/db/queries/devices';
import {updateDeviceById, deleteDeviceById} from '@/db/mutations/devices';

// PATCH /api/devices/[id] - Update device (admin only)
export async function PATCH(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {id: deviceId} = await params;
		if (!deviceId) {
			return NextResponse.json({error: 'Device ID is required'}, {status: 400});
		}

		const device = await getDeviceById(deviceId);
		if (!device) {
			return NextResponse.json({error: 'Device not found'}, {status: 404});
		}

		const body = await request.json();
		const {deviceName, location, isActive, notes} = body;

		const updated = await updateDeviceById(deviceId, {
			deviceName,
			location,
			isActive,
			notes,
		});

		const eventType =
			body.isActive !== undefined
				? body.isActive
					? 'device_activated'
					: 'device_deactivated'
				: 'device_updated';

		await logAudit({
			clerkUserId: userId,
			event: eventType,
			details: `${eventType === 'device_updated' ? 'Updated' : body.isActive ? 'Activated' : 'Deactivated'} device: ${device.deviceName}`,
			deviceId: device.deviceId,
			location: device.location,
		});

		return NextResponse.json({success: true, device: updated});
	} catch (error: any) {
		console.error('Error updating device:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// DELETE /api/devices/[id] - Delete device (admin only)
export async function DELETE(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {id: deviceId} = await params;
		if (!deviceId) {
			return NextResponse.json({error: 'Device ID is required'}, {status: 400});
		}

		const device = await getDeviceById(deviceId);
		if (!device) {
			return NextResponse.json({error: 'Device not found'}, {status: 404});
		}

		await deleteDeviceById(deviceId);

		await logAudit({
			clerkUserId: userId,
			event: 'device_deleted',
			details: `Deleted device: ${device.deviceName}`,
			deviceId: device.deviceId,
			location: device.location,
		});

		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('Error deleting device:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
