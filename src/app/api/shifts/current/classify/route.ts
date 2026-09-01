import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {
	CareShiftAccessDeniedError,
	CareShiftConflictError,
	CareShiftNotFoundError,
	CareShiftValidationError,
	classifyCurrentShift,
} from '@/db/mutations/care';
import {InvalidOperationalTimeZoneConfigError} from '@/db/queries/care';
import {InvalidOperationalTimeZoneError} from '@/lib/operational-time';

// One-time classification of an already-open legacy shift (clocked in
// before the daily water-temperature check feature existed, so it has no
// locationId/shiftSlot/operationalDate identity). Accepts a single
// authorized slot, resolves the shift's existing location fail-closed, and
// freezes the operational date from the original clock-in time. A shift
// that is already classified -- including a second concurrent attempt on
// the same shift -- returns a 409 conflict rather than silently
// overwriting the frozen identity.
export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const body = await req.json().catch(() => ({}));
		const currentShift = await classifyCurrentShift(userId, body?.shiftSlot);

		return NextResponse.json(currentShift, {
			status: 200,
			headers: {'Cache-Control': 'private, no-store'},
		});
	} catch (error: any) {
		console.error('Error classifying shift:', error);
		const message = error?.message || 'Failed to classify shift';

		let status = 500;
		if (error instanceof CareShiftValidationError) {
			status = 400;
		} else if (error instanceof CareShiftAccessDeniedError) {
			status = 403;
		} else if (error instanceof CareShiftNotFoundError) {
			status = 404;
		} else if (error instanceof CareShiftConflictError) {
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
