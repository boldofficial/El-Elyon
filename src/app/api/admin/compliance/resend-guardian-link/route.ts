import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {resendGuardianLink} from '@/db/mutations/compliance';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {linkId} = await req.json();

		if (!linkId) {
			return new NextResponse('linkId is required', {status: 400});
		}

		const result = await resendGuardianLink(userId, linkId);
		return NextResponse.json(result, {status: 200});
	} catch (error: any) {
		console.error('Error resending guardian link:', error);
		return new NextResponse(error.message, {status: 500});
	}
}
