import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {updateKioskStatus} from '@/db/mutations/kiosks';

// PATCH /api/admin/kiosks/[id]/status - Update kiosk status
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
		const {status} = body;

		// Validate status
		if (!['active', 'disabled', 'retired'].includes(status)) {
			return NextResponse.json(
				{error: 'Invalid status. Must be: active, disabled, or retired'},
				{status: 400}
			);
		}

		const updatedKiosk = await updateKioskStatus(kioskId, status);

		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_KIOSK_STATUS_SUCCESS',
			details: `Kiosk ${kioskId} status changed to: ${status}`,
			deviceId: updatedKiosk.deviceId,
			location: updatedKiosk.location,
		});

		return NextResponse.json({success: true, kiosk: updatedKiosk});
	} catch (error: any) {
		console.error('Error updating kiosk status:', error);
		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_KIOSK_STATUS_FAILED',
			details: error.message,
			deviceId: 'system',
			location: '',
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
