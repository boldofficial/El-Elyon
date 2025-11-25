import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {listAvailableKioskDevices} from '@/db/queries/kiosks';

// GET /api/admin/kiosks/available-devices - List available kiosk devices for employee assignment
export async function GET() {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const devices = await listAvailableKioskDevices(userId);

		console.log(`📱 Found ${devices.length} available kiosk device(s)`);

		return NextResponse.json(devices);
	} catch (error: any) {
		console.error('Error listing available kiosk devices:', error);
		await logAudit({
			clerkUserId: userId,
			event: 'LIST_AVAILABLE_DEVICES_FAILED',
			details: error.message,
			deviceId: 'system',
			location: '',
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
