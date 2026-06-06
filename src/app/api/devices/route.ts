// =============================================
// src/app/api/devices/route.ts
// =============================================
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminOrPrivilege, logAudit} from '@/lib/db-helpers';
import {listDevices, getDeviceByDeviceId} from '@/db/queries/devices';
import {registerDevice} from '@/db/mutations/devices';

// GET /api/devices - List all devices (admin only)
export async function GET(req: NextRequest) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminOrPrivilege(userId, 'manage_devices');

		const location = req.nextUrl.searchParams.get('location') || undefined;
		const devicesList = await listDevices(userId, location);

		console.log(`📱 Found ${devicesList.length} device(s)`);
		return NextResponse.json(devicesList);
	} catch (error: any) {
		console.error('Error listing devices:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// POST /api/devices - Register a new device (admin only)
export async function POST(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminOrPrivilege(userId, 'manage_devices');

		const body = await request.json();
		const {deviceId, deviceName, location, deviceType, metadata, notes} = body;

		console.log('📱 POST /api/devices', body);

		if (!deviceId || !deviceName || !location) {
			return NextResponse.json(
				{error: 'Missing required fields: deviceId, deviceName, location'},
				{status: 400}
			);
		}

		// Check if device already exists
		const existingDevice = await getDeviceByDeviceId(deviceId);
		if (existingDevice) {
			return NextResponse.json(
				{error: 'Device already registered'},
				{status: 409}
			);
		}

		const device = await registerDevice({
			deviceId,
			deviceName,
			location,
			deviceType,
			metadata,
			notes,
			registeredBy: userId,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'device_registered',
			details: `Registered device: ${deviceName}`,
			deviceId: deviceId,
			location: location,
		});

		return NextResponse.json(device, {status: 201});
	} catch (error: any) {
		console.error('Error registering device:', error);
		await logAudit({
			clerkUserId: userId,
			event: 'device_register_failed',
			details: error.message,
			deviceId: 'system',
			location: '',
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
