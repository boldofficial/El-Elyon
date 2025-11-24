// POST /api/kiosk/complete-pairing - Complete kiosk pairing (public endpoint)
import {NextResponse} from 'next/server';
import {completePairing} from '@/db/mutations/kiosks';
import {logAudit} from '@/lib/db-helpers';

export async function POST(request: Request) {
	try {
		const body = await request.json();
		const {token, kioskIdentifier} = body;

		if (!token) {
			return NextResponse.json({error: 'Token is required'}, {status: 400});
		}

		// Normalize token to uppercase and trim
		const normalizedToken = token.toUpperCase().trim();

		console.log(`🔗 Attempting to pair kiosk with token: ${normalizedToken}`);

		const result = await completePairing({
			token: normalizedToken,
			kioskIdentifier: kioskIdentifier || 'Unknown Device',
		});

		await logAudit({
			clerkUserId: null, // No user during pairing
			event: 'KIOSK_PAIRING_SUCCESS',
			details: `Kiosk paired: ${result.deviceId} at ${result.location}`,
			deviceId: result.deviceId,
			location: result.location,
		});

		console.log(`✅ Kiosk paired successfully: ${result.deviceId}`);

		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error completing pairing:', error);
		await logAudit({
			clerkUserId: null,
			event: 'KIOSK_PAIRING_FAILED',
			details: error.message,
			deviceId: 'system',
			location: '',
		});
		return NextResponse.json({error: error.message}, {status: 400});
	}
}
