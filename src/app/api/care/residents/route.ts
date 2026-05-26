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

		if (userData.role === 'admin' && residentId) {
			const resident = await db.query.residents.findFirst({
				where: eq(residents.id, residentId),
			});
			return NextResponse.json(resident || null);
		}

		const currentShift = await db.query.shifts.findFirst({
			where: and(eq(shifts.clerkUserId, userId), isNull(shifts.clockOutTime)),
			orderBy: [desc(shifts.clockInTime)],
		});

		if (!currentShift) {
			return NextResponse.json(residentId ? null : []);
		}

		// Care Portal data is scoped to the location of the active shift.
		if (userData.role === 'admin') {
			if (residentId) {
				const resident = await db.query.residents.findFirst({
					where: (residents, {and, eq}) =>
						and(
							eq(residents.id, residentId),
							eq(residents.location, currentShift.location)
						),
				});
				return NextResponse.json(resident || null);
			}
			const locationResidents = await db.query.residents.findMany({
				where: eq(residents.location, currentShift.location),
			});
			return NextResponse.json(locationResidents);
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
