import {auth, clerkClient} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs, residents, shifts} from '@/db/schema';
import {getOperationalTimeZone} from '@/db/queries/care';
import {requireCareAccess, logAudit} from '@/lib/db-helpers';
import {computeOperationalDate} from '@/lib/operational-time';
import {localDayStartUtc} from '@/lib/care-log-report';
import {
	LATE_ENTRY_REASON_MAX_LENGTH,
	lateEntryDateError,
	shiftDate,
} from '@/lib/care-log-policy';
import {and, desc, eq, gte, isNull, lt} from 'drizzle-orm';

/**
 * The shift `userId` worked at `location` whose operational day is
 * `loggedForDate`. An overnight shift belongs to the day it started, the same
 * rule clock-in uses. Shifts from before operationalDate was recorded fall
 * back to the local date of their clock-in.
 */
async function findShiftWorkedOn(
	userId: string,
	location: string,
	loggedForDate: string,
	timeZone: string
) {
	// Pad a day each side so the clock-in fallback can't miss across a DST edge.
	const candidates = await db.query.shifts.findMany({
		where: and(
			eq(shifts.clerkUserId, userId),
			eq(shifts.location, location),
			gte(shifts.clockInTime, localDayStartUtc(shiftDate(loggedForDate, -1), timeZone)),
			lt(shifts.clockInTime, localDayStartUtc(shiftDate(loggedForDate, 2), timeZone))
		),
		orderBy: [desc(shifts.clockInTime)],
	});
	return candidates.find(
		(shift) =>
			(shift.operationalDate ?? computeOperationalDate(shift.clockInTime, timeZone)) ===
			loggedForDate
	);
}

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userRole = await requireCareAccess(userId);

		const {residentId, template, content, loggedForDate, lateEntryReason} =
			await req.json();
		const isLateEntry = loggedForDate !== undefined && loggedForDate !== null && loggedForDate !== '';

		if (!residentId) {
			return NextResponse.json({error: 'residentId is required'}, {status: 400});
		}

		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, residentId),
		});

		if (!resident) {
			return NextResponse.json({error: 'Resident not found'}, {status: 404});
		}

		let logLocation = resident.location;
		let shiftId: string | undefined;

		if (userRole.role !== 'admin') {
			const currentShift = await db.query.shifts.findFirst({
				where: and(eq(shifts.clerkUserId, userId), isNull(shifts.clockOutTime)),
				orderBy: [desc(shifts.clockInTime)],
			});

			if (!currentShift) {
				return NextResponse.json(
					{error: 'You must be clocked in to create care logs'},
					{status: 409}
				);
			}

			if (isLateEntry) {
				// A late entry belongs to the shift it is for, which is checked
				// below; the house only has to be one this worker is assigned to.
				if (!resident.location || !(userRole.locations || []).includes(resident.location)) {
					return NextResponse.json({error: 'Access denied'}, {status: 403});
				}
			} else {
				if (resident.location !== currentShift.location) {
					return NextResponse.json(
						{error: 'Resident is not available for your active shift location'},
						{status: 403}
					);
				}

				logLocation = currentShift.location;
				shiftId = currentShift.id;
			}
		}

		if (!logLocation) {
			return NextResponse.json(
				{error: 'Resident location is required to create care logs'},
				{status: 400}
			);
		}

		let reason: string | null = null;
		if (isLateEntry) {
			const timeZone = await getOperationalTimeZone();
			const today = computeOperationalDate(new Date(), timeZone);
			const dateError = lateEntryDateError(loggedForDate, today);
			if (dateError) {
				return NextResponse.json({error: dateError}, {status: 400});
			}

			if (lateEntryReason !== undefined && lateEntryReason !== null && typeof lateEntryReason !== 'string') {
				return NextResponse.json({error: 'Reason must be text'}, {status: 400});
			}
			reason = lateEntryReason?.trim() || null;
			if (reason && reason.length > LATE_ENTRY_REASON_MAX_LENGTH) {
				return NextResponse.json(
					{error: `Keep the reason under ${LATE_ENTRY_REASON_MAX_LENGTH} characters`},
					{status: 400}
				);
			}

			// Applies to admins too: a late entry must point at a shift that was
			// really worked, never at the day it happened to be typed.
			const workedShift = await findShiftWorkedOn(userId, logLocation, loggedForDate, timeZone);
			if (!workedShift) {
				return NextResponse.json(
					{
						error: `You have no shift on record at ${logLocation} on ${loggedForDate}. Ask a supervisor to correct your shift record first.`,
					},
					{status: 409}
				);
			}
			shiftId = workedShift.id;
		}

		const client = await clerkClient();
		const clerkUser = await client.users.getUser(userId);
		const authorName =
			clerkUser.firstName || clerkUser.lastName
				? [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ')
				: clerkUser.username || clerkUser.emailAddresses[0]?.emailAddress || 'Unknown User';

		const [log] = await db
			.insert(residentLogs)
			.values({
				residentId,
				template,
				content,
				location: logLocation,
				shiftId,
				authorId: userId,
				authorName,
				createdBy: userId,
				createdAt: new Date(),
				version: 1,
				loggedForDate: isLateEntry ? loggedForDate : null,
				lateEntryReason: reason,
			})
			.returning();

		if (isLateEntry) {
			await logAudit({
				clerkUserId: userId,
				event: 'resident.log.late_entry',
				details: `logId=${log.id},residentId=${residentId},loggedForDate=${loggedForDate},shiftId=${shiftId}`,
				deviceId: 'system',
				location: logLocation,
			});
		}

		return NextResponse.json(log);
	} catch (error) {
		console.error('Error creating log:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
