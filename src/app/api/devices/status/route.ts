import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {getDeviceByDeviceId} from '@/db/queries/devices';
import {updateDeviceStatus} from '@/db/mutations/devices';

// PATCH /api/devices/status - Update device status by deviceId (admin only)
export async function PATCH(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const body = await request.json();
		const {deviceId, isActive} = body;

		if (!deviceId || isActive === undefined) {
			return NextResponse.json(
				{error: 'deviceId and isActive are required'},
				{status: 400}
			);
		}

		const device = await getDeviceByDeviceId(deviceId);
		if (!device) {
			return NextResponse.json({error: 'Device not found'}, {status: 404});
		}

		const updated = await updateDeviceStatus(deviceId, isActive);

		await logAudit({
			clerkUserId: userId,
			event: isActive ? 'device_activated' : 'device_deactivated',
			details: `${isActive ? 'Activated' : 'Deactivated'} device: ${device.deviceName}`,
			deviceId: deviceId,
			location: device.location,
		});

		return NextResponse.json({success: true, device: updated});
	} catch (error: any) {
		console.error('Error updating device status:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
