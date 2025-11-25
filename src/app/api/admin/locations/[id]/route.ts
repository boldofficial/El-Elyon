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
export async function GET(request: Request, {params}: {params: {id: string}}) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const locationId = params.id;
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

		const locationId = params.id;
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
	{params}: {params: {id: string}}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const locationId = params.id;
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


//
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


// ====================================
// Delete a location
// ========================================
import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';
import {locations, residents} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function DELETE(req: Request) {
  try {
    await requireRole(['admin']);
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

//////
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess} from '../../../../../../lib/db-helpers';
import {db} from '../../../../../../db/index';
import {residents, kiosks, roles} from '../../../../../../db/schema';

export async function GET() {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const residentsList = await db.query.residents.findMany();
		const kiosksList = await db.query.kiosks.findMany();
		const rolesList = await db.query.roles.findMany();

		const locationNames = [
			...new Set([
				...residentsList.map((r) => r.location),
				...kiosksList.map((k) => k.location),
			]),
		];

		const locationsSummary = locationNames.map((location) => ({
			name: location,
			residentCount: residentsList.filter((r) => r.location === location)
				.length,
			kioskCount: kiosksList.filter(
				(k) => k.location === location && k.status === 'active'
			).length,
			staffCount: rolesList.filter(
				(r) => r.role === 'staff' && (r.locations || []).includes(location)
			).length,
		}));

		return NextResponse.json(locationsSummary);
	} catch (error: any) {
		console.error('Error getting locations summary:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}


// ====================================
// Sync locations from string array
// ====================================
import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';
import {locations} from '@/db/schema';

export async function POST(req: Request) {
  try {
    const user = await requireRole(['admin']);
    const {locationNames} = await req.json();

    console.log('🏢 Syncing locations:', locationNames);

    const existingLocations = await db.query.locations.findMany();
    const existingNames = new Set(existingLocations.map((l) => l.name));

    let created = 0;
    for (const name of locationNames) {
      if (!existingNames.has(name)) {
        await db.insert(locations).values({
          name,
          status: 'active',
          createdBy: user.clerkUserId,
          createdAt: new Date(),
        });
        console.log(`✅ Created location: ${name}`);
        created++;
      }
    }

    console.log(
      `🎉 Location sync complete! Created: ${created}, Existing: ${existingNames.size}`
    );

    return NextResponse.json({
      success: true,
      created,
      existing: existingNames.size,
    });
  } catch (error) {
    console.error('Error syncing locations:', error);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
}


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


// ===================================
// Get all locations
// ====================================
import {NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';

export async function GET() {
	try {
		await requireRole(['admin']);

		const locations = await db.query.locations.findMany();
		return NextResponse.json(locations);
	} catch (error) {
		console.error('Error getting locations:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
