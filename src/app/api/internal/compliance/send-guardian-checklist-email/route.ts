// src/app/api/internal/send-guardian-checklist-email/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {sendGuardianChecklistEmail} from '@/lib/emails/guardian';

export async function POST(req: NextRequest) {
	try {
		// TODO: Add internal API key authentication
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
