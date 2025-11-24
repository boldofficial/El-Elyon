import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {insertKiosk} from '@/db/mutations/kiosks';
import {db} from '@/db/index';
import {kiosks} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function POST(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const body = await request.json();
		const {deviceId, location, deviceLabel} = body;

		console.log('POST /api/admin/kiosks', body);

		if (!deviceId || !location) {
			return NextResponse.json(
				{error: 'Missing required fields: deviceId, location'},
				{status: 400}
			);
		}

		// Check if device already exists
		const existingKiosk = await db.query.kiosks.findFirst({
			where: eq(kiosks.deviceId, deviceId),
		});

		if (existingKiosk) {
			return NextResponse.json(
				{error: 'Device ID already registered'},
				{status: 409}
			);
		}

		const newKiosk = await insertKiosk({
			name: deviceLabel || `Kiosk ${deviceId.slice(0, 8)}`,
			deviceId,
			location,
			deviceLabel,
			status: 'active',
			registeredAt: new Date(),
			registeredBy: userId,
			createdAt: new Date(),
			createdBy: userId,
			active: true, // Assuming 'active' field exists and should be true
		});

		await logAudit({
			clerkUserId: userId,
			event: 'REGISTER_KIOSK_SUCCESS',
			details: `Kiosk ${newKiosk.id} registered.`,
			deviceId: deviceId,
			location: location,
		});
		return NextResponse.json(newKiosk, {status: 201});
	} catch (error: any) {
		await logAudit({
			clerkUserId: userId,
			event: 'REGISTER_KIOSK_FAILED',
			details: error.message,
			deviceId: '', // No deviceId if registration failed
			location: '', // No location if registration failed
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
