// ====================================
// Get residents API
// ===================================
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {residents} from '@/db/schema';

export async function GET() {
		const {userId} = await auth();
		if (!userId) {
				return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		try {
				await requireCareAccess(userId);

				const residentsList = await db.query.residents.findMany({
						orderBy: (residents, {asc}) => [asc(residents.name)],
				});

				return NextResponse.json(
						residentsList.map((r) => ({
								id: r.id,
								name: r.name,
								location: r.location,
								dateOfBirth: r.dateOfBirth,
								profileImageId: r.profileImageId,
						}))
				);
		} catch (error: any) {
				console.error('Error fetching residents:', error);
				return NextResponse.json({error: error.message}, {status: 500});
		}
}
