import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getRoleByClerkId} from '@/db/queries/roles';
import {updateDeviceStatus} from '@/db/mutations/devices';

export async function PUT(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		// Check if user is admin
		const role = await getRoleByClerkId(userId);
		if (role?.role !== 'admin') {
			return NextResponse.json(
				{error: 'Only admins can update devices'},
				{status: 403}
			);
		}

		const {deviceId, isActive} = await req.json();

		if (!deviceId || isActive === undefined) {
			return NextResponse.json(
				{error: 'Missing required fields'},
				{status: 400}
			);
		}

		await updateDeviceStatus(deviceId, isActive, userId);

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error updating device status:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
