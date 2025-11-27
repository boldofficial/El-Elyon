// src/app/api/guardian-checklists/links/[id]/resend/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {resendChecklistToGuardian} from '@/db/mutations/guardian-checklists';

export async function POST(req: NextRequest, {params}: {params: {id: string}}) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const result = await resendChecklistToGuardian(userId, params.id);

		// Trigger email sending
		await fetch(
			`${process.env.NEXT_PUBLIC_SITE_URL}/api/internal/send-guardian-checklist-email`,
			{
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					linkId: params.id,
					token: result.token,
				}),
			}
		);

		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error resending checklist:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
