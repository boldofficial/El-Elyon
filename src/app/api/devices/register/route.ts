import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getRoleByClerkId} from '@/db/queries/roles';
import {registerDevice} from '@/db/mutations/devices';
import {getDeviceByDeviceId} from '@/db/queries/devices';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const role = await getRoleByClerkId(userId);
		if (role?.role !== 'admin') {
			return NextResponse.json(
				{error: 'Only admins can register devices'},
				{status: 403}
			);
		}

		const {deviceId, deviceName, location, deviceType, metadata, notes} =
			await req.json();

		if (!deviceId || !deviceName || !location) {
			return NextResponse.json(
				{error: 'Missing required fields'},
				{status: 400}
			);
		}

		const existingDevice = await getDeviceByDeviceId(deviceId);
		if (existingDevice) {
			return NextResponse.json(
				{error: 'Device already registered'},
				{status: 400}
			);
		}

		const newDevice = await registerDevice({
			deviceId,
			deviceName,
			location,
			deviceType: deviceType || 'desktop',
			registeredBy: userId,
			metadata,
			notes,
		});

		console.log('✅ Device registered:', newDevice.deviceId);

		return NextResponse.json({success: true, deviceId: newDevice.id});
	} catch (error) {
		console.error('Error registering device:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
