import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminOrPrivilege} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {residents, kiosks, roles} from '@/db/schema';

export async function GET() {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminOrPrivilege(userId, 'manage_locations');

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
            residentCount: residentsList.filter((r) => r.location === location).length,
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
