import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residents} from '@/db/schema';
import {getFullUserData} from '@/db/queries/users';
import {inArray} from 'drizzle-orm';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userData = await getFullUserData(userId);

		if (!userData) {
			return NextResponse.json([]);
		}

		// Admins can see all residents
		if (userData.role === 'admin') {
			const allResidents = await db.query.residents.findMany();
			return NextResponse.json(allResidents);
		}

		// Non-admins only see residents in their assigned locations
		if (!userData.locations || userData.locations.length === 0) {
			return NextResponse.json([]);
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
