// src/app/api/admin/locations/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {createLocation} from '@/db/mutations/locations';
import {db} from '@/db/index';

// GET - List all locations
export async function GET() {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const locations = await db.query.locations.findMany({
            orderBy: (locations, {asc}) => [asc(locations.name)],
        });

        return NextResponse.json(locations);
    } catch (error: any) {
        console.error('Error fetching locations:', error);
        return NextResponse.json({error: error.message}, {status: 500});
    }
}

// POST - Create new location
export async function POST(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const body = await request.json();

        const location = await createLocation({
            name: body.name,
            address: body.address,
            phone: body.phone,
            capacity: body.capacity,
            status: body.status || 'active',
            createdBy: userId,
        });

        await logAudit({
            clerkUserId: userId,
            event: 'CREATE_LOCATION',
            details: `Created location ${body.name}`,
            deviceId: 'system',
            location: body.name,
        });

        return NextResponse.json(location, {status: 201});
    } catch (error: any) {
        console.error('Error creating location:', error);
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
