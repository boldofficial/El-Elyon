// src/app/api/admin/kiosks/pairing-tokens/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {listPairingTokens} from '@/db/queries/kiosks';
import {createPairingToken} from '@/db/mutations/kiosks';

// GET /api/admin/kiosks/pairing-tokens - List active pairing tokens
export async function GET() {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const tokens = await listPairingTokens(userId);

		return NextResponse.json(tokens);
	} catch (error: any) {
		console.error('Error listing pairing tokens:', error);
		await logAudit({
			clerkUserId: userId,
			event: 'LIST_PAIRING_TOKENS_FAILED',
			details: error.message,
			deviceId: 'system',
			location: '',
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// POST /api/admin/kiosks/pairing-tokens - Create new pairing token
export async function POST(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const body = await request.json();
		const {location, deviceLabel} = body;

		if (!location) {
			return NextResponse.json({error: 'Location is required'}, {status: 400});
		}

		const token = await createPairingToken({
			location,
			deviceLabel,
			issuedBy: userId,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'CREATE_PAIRING_TOKEN_SUCCESS',
			details: `Token created for location: ${location}`,
			deviceId: 'system',
			location,
		});

		// Return token with full URL
		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

		return NextResponse.json({
			id: token.id,
			token: token.token,
			location: token.location,
			deviceLabel: token.deviceLabel,
			expiresAt: token.expiresAt,
			pairingUrl: `${baseUrl}/kiosk?token=${token.token}`,
		});
	} catch (error: any) {
		console.error('Error creating pairing token:', error);
		await logAudit({
			clerkUserId: userId,
			event: 'CREATE_PAIRING_TOKEN_FAILED',
			details: error.message,
			deviceId: 'system',
			location: '',
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
