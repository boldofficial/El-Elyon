// src/app/api/guardian-checklists/links/[id]/resend/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {resendChecklistToGuardian} from '@/db/mutations/guardian-checklists';

export async function POST(
	req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const {id} = await params;
		const result = await resendChecklistToGuardian(userId, id);

		// Trigger email sending
		await fetch(
			`${process.env.NEXT_PUBLIC_SITE_URL}/api/internal/compliance/send-guardian-checklist-email`,
			{
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					linkId: id,
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
