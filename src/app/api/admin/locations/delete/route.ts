// ====================================
// Delete a location
// ========================================
import {NextResponse} from 'next/server';
import {requireRoleOrPrivilege} from '@/lib/auth';
import {db} from '@/db/index';
import {locations, residents} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function DELETE(req: Request) {
	try {
		await requireRoleOrPrivilege(['admin'], ['manage_locations']);
		const {locationId} = await req.json();

		const location = await db.query.locations.findFirst({
			where: eq(locations.id, locationId),
		});

		if (!location) {
			return NextResponse.json({error: 'Location not found'}, {status: 404});
		}

		// Check if location is in use
		const residentsInLocation = await db.query.residents.findFirst({
			where: eq(residents.location, location.name),
		});

		if (residentsInLocation) {
			return NextResponse.json(
				{error: 'Cannot delete location with residents'},
				{status: 400}
			);
		}

		await db.delete(locations).where(eq(locations.id, locationId));
		console.log(`🗑️  Deleted location: ${location.name}`);

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error deleting location:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
