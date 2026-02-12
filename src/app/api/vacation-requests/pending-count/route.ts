// src/app/api/vacation-requests/pending-count/route.ts
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {internalServerError} from '@/lib/api-errors';
import {getPendingVacationRequestsCount} from '@/db/queries/vacation-requests';

// GET - Get count of pending vacation requests
export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const count = await getPendingVacationRequestsCount(userId);

		return NextResponse.json({count});
	} catch (error) {
		return internalServerError(error, 'GetPendingVacationCount');
	}
}
