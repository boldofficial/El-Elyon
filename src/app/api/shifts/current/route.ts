import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {shifts} from '@/db/schema';
import {eq, and, isNull} from 'drizzle-orm';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		// Find active shift (no clock out time)
		const currentShift = await db.query.shifts.findFirst({
			where: and(eq(shifts.clerkUserId, userId), isNull(shifts.clockOutTime)),
		});

		if (!currentShift) {
			return NextResponse.json(null);
		}

		return NextResponse.json(currentShift);
	} catch (error) {
		console.error('Error getting current shift:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
