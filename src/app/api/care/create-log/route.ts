import {auth, clerkClient} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs, residents, shifts} from '@/db/schema';
import {requireCareAccess} from '@/lib/db-helpers';
import {and, desc, eq, isNull} from 'drizzle-orm';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userRole = await requireCareAccess(userId);

		const {residentId, template, content} = await req.json();

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

			if (resident.location !== currentShift.location) {
				return NextResponse.json(
					{error: 'Resident is not available for your active shift location'},
					{status: 403}
				);
			}

			logLocation = currentShift.location;
			shiftId = currentShift.id;
		}

		if (!logLocation) {
			return NextResponse.json(
				{error: 'Resident location is required to create care logs'},
				{status: 400}
			);
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
			})
			.returning();

		return NextResponse.json(log);
	} catch (error) {
		console.error('Error creating log:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
