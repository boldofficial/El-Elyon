// src/app/api/internal/send-guardian-checklist-email/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {sendGuardianChecklistEmail} from '@/lib/emails/guardian';

export async function POST(req: NextRequest) {
	try {
		// Verify internal API key
		const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
		const expectedKey = process.env.INTERNAL_API_KEY;

		if (!expectedKey) {
			return NextResponse.json(
				{error: 'Internal API not configured'},
				{status: 500}
			);
		}

		if (apiKey !== expectedKey) {
			console.log('🚨 Unauthorized internal API call to send-guardian-checklist-email');
			return NextResponse.json(
				{error: 'Unauthorized'},
				{status: 401}
			);
		}

		const {linkId, token} = await req.json();

		if (!linkId || !token) {
			return NextResponse.json(
				{error: 'linkId and token are required'},
				{status: 400}
			);
		}

		const result = await sendGuardianChecklistEmail(linkId, token);
		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error sending guardian checklist email:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
