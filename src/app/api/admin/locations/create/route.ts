// =====================================
// Create a new location
// ====================================
import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';
import {locations} from '@/db/schema';

export async function POST(req: Request) {
	try {
		const user = await requireRole(['admin']);
		const {name, address, capacity} = await req.json();

		const [location] = await db
			.insert(locations)
			.values({
				name,
				address: address || null,
				capacity: capacity || null,
				status: 'active',
				createdBy: user.clerkUserId,
				createdAt: new Date(),
			})
			.returning();

		console.log(`✅ Created location: ${name} (${location.id})`);

		return NextResponse.json({locationId: location.id});
	} catch (error) {
		console.error('Error creating location:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
