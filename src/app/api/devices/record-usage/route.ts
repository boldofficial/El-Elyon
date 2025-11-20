// import {auth} from '@clerk/nextjs/server';
// import {NextResponse} from 'next/server';
// import {recordDeviceUsage} from '@/db/mutations/devices';

// export async function POST(req: Request) {
// 	try {
// 		const {userId} = await auth();

// 		if (!userId) {
// 			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
// 		}

// 		const {deviceId} = await req.json();

// 		if (!deviceId) {
// 			return NextResponse.json({error: 'Device ID required'}, {status: 400});
// 		}

// 		const result = await recordDeviceUsage(deviceId, userId);

// 		return NextResponse.json(result);
// 	} catch (error) {
// 		console.error('Error recording device usage:', error);
// 		return NextResponse.json({error: 'Internal server error'}, {status: 500});
// 	}
// }

// =============================================
// src/app/api/devices/record-usage/route.ts
// =============================================
import {NextResponse} from 'next/server';
import {auth, currentUser} from '@clerk/nextjs/server';
import {recordDeviceUsage} from '@/db/mutations/devices';
import {logAudit} from '@/lib/db-helpers';

// POST /api/devices/record-usage - Record device usage when user logs in
export async function POST(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const user = await currentUser();
		const body = await request.json();
		const {deviceId} = body;

		if (!deviceId) {
			return NextResponse.json({error: 'Device ID is required'}, {status: 400});
		}

		const result = await recordDeviceUsage(
			deviceId,
			userId,
			user?.emailAddresses?.[0]?.emailAddress,
			user?.firstName
				? `${user.firstName} ${user.lastName || ''}`.trim()
				: undefined
		);

		if (result.success) {
			await logAudit({
				clerkUserId: userId,
				event: 'device_login',
				timestamp: new Date(),
				details: `Login from device: ${result.deviceName}`,
				deviceId: deviceId,
				location: result.location || '',
			});
		}

		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error recording device usage:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
