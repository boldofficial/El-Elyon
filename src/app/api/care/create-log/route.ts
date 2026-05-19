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

		await requireCareAccess(userId);

		const {residentId, template, content} = await req.json();

		if (!residentId) {
			return NextResponse.json({error: 'residentId is required'}, {status: 400});
		}

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

		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, residentId),
		});

		if (!resident || resident.location !== currentShift.location) {
			return NextResponse.json(
				{error: 'Resident is not available for your active shift location'},
				{status: 403}
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
				location: currentShift.location,
				shiftId: currentShift.id,
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
