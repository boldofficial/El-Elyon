import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {recordDeviceUsage} from '@/db/mutations/devices';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const {deviceId} = await req.json();

		if (!deviceId) {
			return NextResponse.json({error: 'Device ID required'}, {status: 400});
		}

		const result = await recordDeviceUsage(deviceId, userId);

		return NextResponse.json(result);
	} catch (error) {
		console.error('Error recording device usage:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
