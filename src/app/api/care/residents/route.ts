import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residents} from '@/db/schema';
import {getFullUserData} from '@/db/queries/users';
import {inArray} from 'drizzle-orm';

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

		// Admins can see all residents
		if (userData.role === 'admin') {
			if (residentId) {
				const resident = await db.query.residents.findFirst({
					where: (residents, {eq}) => eq(residents.id, residentId),
				});
				return NextResponse.json(resident || null);
			}
			const allResidents = await db.query.residents.findMany();
			return NextResponse.json(allResidents);
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
						inArray(residents.location, userData.locations)
					),
			});
			return NextResponse.json(resident || null);
		}

		const locationResidents = await db.query.residents.findMany({
			where: inArray(residents.location, userData.locations),
		});

		return NextResponse.json(locationResidents);
	} catch (error) {
		console.error('Error getting residents:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
