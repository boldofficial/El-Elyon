import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residents, shifts} from '@/db/schema';
import {getFullUserData} from '@/db/queries/users';
import {and, desc, eq, inArray, isNull} from 'drizzle-orm';

export async function GET(request: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userData = await getFullUserData(userId);

		if (!userData) {
			return NextResponse.json([]);
		}

		const {searchParams} = new URL(request.url);
		const residentId = searchParams.get('residentId');
		const location = searchParams.get('location');

		if (userData.role === 'admin') {
			if (residentId) {
				const resident = await db.query.residents.findFirst({
					where: location
						? and(eq(residents.id, residentId), eq(residents.location, location))
						: eq(residents.id, residentId),
				});
				return NextResponse.json(resident || null);
			}

			const residentList = await db.query.residents.findMany({
				where: location ? eq(residents.location, location) : undefined,
			});
			return NextResponse.json(residentList);
		}

		const currentShift = await db.query.shifts.findFirst({
			where: and(eq(shifts.clerkUserId, userId), isNull(shifts.clockOutTime)),
			orderBy: [desc(shifts.clockInTime)],
		});

		if (!currentShift) {
			return NextResponse.json(residentId ? null : []);
		}

		// Non-admins only see residents in their assigned locations
		if (!userData.locations || userData.locations.length === 0) {
			return NextResponse.json(residentId ? null : []);
		}

		if (residentId) {
			const resident = await db.query.residents.findFirst({
				where: (residents, {eq, and, inArray}) =>
					and(
						eq(residents.id, residentId),
						inArray(residents.location, userData.locations),
						eq(residents.location, currentShift.location)
					),
			});
			return NextResponse.json(resident || null);
		}

		const locationResidents = await db.query.residents.findMany({
			where: and(
				inArray(residents.location, userData.locations),
				eq(residents.location, currentShift.location)
			),
		});

		return NextResponse.json(locationResidents);
	} catch (error) {
		console.error('Error getting residents:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
