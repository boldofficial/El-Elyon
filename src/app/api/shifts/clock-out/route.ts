import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db';
import {shifts} from '@/db/schema';
import {eq, and, isNull} from 'drizzle-orm';

export async function POST() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		// Find active shift
		const currentShift = await db.query.shifts.findFirst({
			where: and(eq(shifts.clerkUserId, userId), isNull(shifts.clockOutTime)),
		});

		if (!currentShift) {
			return NextResponse.json({error: 'No active shift found'}, {status: 404});
		}

		// Update shift with clock out time
		await db
			.update(shifts)
			.set({clockOutTime: new Date()})
			.where(eq(shifts.id, currentShift.id));

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error clocking out:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
