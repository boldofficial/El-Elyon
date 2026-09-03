import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {
	CareShiftAccessDeniedError,
	CareShiftConflictError,
	CareShiftValidationError,
	clockIn,
} from '@/db/mutations/care';
import {InvalidOperationalTimeZoneConfigError} from '@/db/queries/care';
import {InvalidOperationalTimeZoneError} from '@/lib/operational-time';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {location, shiftSlot, selfieStorageId} = await req.json();

		if (!location) {
			return new NextResponse('Location is required', {status: 400});
		}

		const shiftId = await clockIn(userId, location, shiftSlot, selfieStorageId);
		return NextResponse.json({shiftId}, {status: 200});
	} catch (error: any) {
		console.error('Error clocking in:', error);
		const message = error?.message || 'Failed to clock in';

		let status = 500;
		if (error instanceof CareShiftValidationError) {
			status = 400;
		} else if (error instanceof CareShiftAccessDeniedError) {
			status = 403;
		} else if (
			error instanceof CareShiftConflictError ||
			message.includes('Already clocked in')
		) {
			status = 409;
		} else if (
			error instanceof InvalidOperationalTimeZoneConfigError ||
			error instanceof InvalidOperationalTimeZoneError
		) {
			status = 500;
		}

		return NextResponse.json({error: message}, {status});
	}
}
