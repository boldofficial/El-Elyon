import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {clockOut} from '@/db/mutations/care';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {selfieStorageId} = await req.json();

		const result = await clockOut(userId, selfieStorageId);
		return NextResponse.json(result, {status: 200});
	} catch (error: any) {
		console.error('Error clocking out:', error);
		return new NextResponse(error.message, {status: 500});
	}
}
