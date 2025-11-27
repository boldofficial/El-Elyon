// ==========================================
// src/app/api/admin/locations/[id]/route.ts
// ==========================================
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {updateLocation, deleteLocation} from '@/db/mutations/locations';
import {db} from '@/db/index';
import {locations} from '@/db/schema';
import {eq} from 'drizzle-orm';

// GET - Get location details
export async function GET(request: Request, {params}: {params: Promise<{id: string}>}) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {id: locationId} = await params;
		const location = await db.query.locations.findFirst({
			where: eq(locations.id, locationId),
		});

		if (!location) {
			return NextResponse.json({error: 'Location not found'}, {status: 404});
		}

		return NextResponse.json(location);
	} catch (error: any) {
		console.error('Error fetching location:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// PATCH - Update location
export async function PATCH(
	request: Request,
	{params}: {params: {id: string}}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {id: locationId} = await params;
		const body = await request.json();

		const updated = await updateLocation(locationId, {
			name: body.name,
			address: body.address,
			phone: body.phone,
			capacity: body.capacity,
			status: body.status,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_LOCATION',
			details: `Updated location ${locationId}`,
			deviceId: 'system',
			location: body.name || '',
		});

		return NextResponse.json(updated);
	} catch (error: any) {
		console.error('Error updating location:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// DELETE - Delete location
export async function DELETE(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {id: locationId} = await params;
		await deleteLocation(locationId);

		await logAudit({
			clerkUserId: userId,
			event: 'DELETE_LOCATION',
			details: `Deleted location ${locationId}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('Error deleting location:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
