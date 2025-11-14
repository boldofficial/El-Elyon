import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {checkDeviceAuthorization} from '@/db/queries/employees';
import {logAudit} from '@/db/mutations/audit';

// GET /api/admin/employees/check-device-authorization?deviceId=[id] - Check device authorization
export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {searchParams} = new URL(req.url);
		const deviceId = searchParams.get('deviceId');

		if (!deviceId) {
			return new NextResponse('Missing deviceId', {status: 400});
		}

		const authorizationStatus = await checkDeviceAuthorization(userId, deviceId);
		return NextResponse.json(authorizationStatus);
	} catch (error: any) {
		console.error('Error checking device authorization:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'check_device_authorization_failed',
			details: `DeviceId: ${req.nextUrl.searchParams.get('deviceId')}, Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
