import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {clockOut} from '@/db/mutations/care';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		// Handle empty body (when selfie is not required)
		let selfieStorageId: string | undefined;
		try {
			const body = await req.json();
			selfieStorageId = body.selfieStorageId;
		} catch {
			// Empty body or invalid JSON - selfie not required
			selfieStorageId = undefined;
		}

		const result = await clockOut(userId, selfieStorageId);
		return NextResponse.json(result, {status: 200});
	} catch (error: any) {
		console.error('Error clocking out:', error);
		return new NextResponse(error.message, {status: 500});
	}
}

