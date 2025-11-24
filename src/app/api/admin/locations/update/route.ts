// =====================================
// Update a location
// ===================================
import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';
import {locations} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function PUT(req: Request) {
	try {
		await requireRole(['admin']);
		const {locationId, name, address, capacity, status} = await req.json();

		await db
			.update(locations)
			.set({
				name,
				address: address || null,
				capacity: capacity || null,
				status,
				updatedAt: new Date(),
			})
			.where(eq(locations.id, locationId));

		console.log(`✅ Updated location: ${name}`);

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error updating location:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
