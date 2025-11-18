import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {updateKioskLabel} from '@/db/mutations/kiosks';

// PATCH /api/admin/kiosks/[id]/label - Update kiosk device label
export async function PATCH(
	request: Request,
	{params}: {params: {id: string}}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const kioskId = params.id;
		if (!kioskId) {
			return NextResponse.json({error: 'Kiosk ID is required'}, {status: 400});
		}

		const body = await request.json();
		const {deviceLabel} = body;

		const updatedKiosk = await updateKioskLabel(kioskId, deviceLabel);

		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_KIOSK_LABEL_SUCCESS',
			details: `Kiosk ${kioskId} label updated to: ${deviceLabel || 'empty'}`,
			deviceId: updatedKiosk.deviceId,
			location: updatedKiosk.location,
		});

		return NextResponse.json({success: true, kiosk: updatedKiosk});
	} catch (error: any) {
		console.error('Error updating kiosk label:', error);
		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_KIOSK_LABEL_FAILED',
			details: error.message,
			deviceId: 'system',
			location: '',
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
