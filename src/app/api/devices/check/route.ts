import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {db} from '@/db';
import {devices} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const deviceId = req.nextUrl.searchParams.get('deviceId');

		if (!deviceId) {
			return NextResponse.json({error: 'Device ID required'}, {status: 400});
		}

		// Check if device is registered
		const device = await db.query.devices.findFirst({
			where: eq(devices.deviceId, deviceId),
		});

		if (!device) {
			return NextResponse.json({
				isRegistered: false,
				isActive: false,
				message: 'This device is not registered in the system.',
			});
		}

		if (!device.isActive) {
			return NextResponse.json({
				isRegistered: true,
				isActive: false,
				message: 'This device has been deactivated.',
			});
		}

		return NextResponse.json({
			isRegistered: true,
			isActive: true,
			device,
		});
	} catch (error) {
		console.error('Error checking device:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
