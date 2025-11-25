import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residents} from '@/db/schema';
import {getFullUserData} from '@/db/queries/users';
import {eq, inArray} from 'drizzle-orm';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userData = await getFullUserData(userId);

		if (!userData || !userData.locations || userData.locations.length === 0) {
			return NextResponse.json([]);
		}

		const allResidents = await db.query.residents.findMany({
			where: inArray(residents.location, userData.locations),
		});

		return NextResponse.json(allResidents);
	} catch (error) {
		console.error('Error getting residents:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
