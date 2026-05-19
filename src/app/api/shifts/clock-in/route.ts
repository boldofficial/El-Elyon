import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {clockIn} from '@/db/mutations/care';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {location, selfieStorageId} = await req.json();

		if (!location) {
			return new NextResponse('Location is required', {status: 400});
		}

		const shiftId = await clockIn(userId, location, selfieStorageId);
		return NextResponse.json({shiftId}, {status: 200});
	} catch (error: any) {
		console.error('Error clocking in:', error);
		const message = error?.message || 'Failed to clock in';
		const status = message.includes('Already clocked in') ? 409 : 500;
		return NextResponse.json({error: message}, {status});
	}
}
