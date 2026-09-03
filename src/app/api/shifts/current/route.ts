import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getCurrentShift} from '@/db/queries/care';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		// Returns a minimal, server-validated current-shift DTO (id,
		// locationId/location, shiftSlot, operationalDate, clockInTime,
		// duration, needsClassification) rather than the raw shifts table row.
		const currentShift = await getCurrentShift(userId);

		return NextResponse.json(currentShift, {
			status: 200,
			headers: {'Cache-Control': 'private, no-store'},
		});
	} catch (error) {
		console.error('Error getting current shift:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
