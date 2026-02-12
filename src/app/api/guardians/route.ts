// src/app/api/guardians/route.ts


import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess, logAudit} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {listAllGuardians, getResidentById} from '@/db/queries/people';
import {insertGuardian} from '@/db/mutations/guardians';

export async function GET(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireCareAccess(userId);

        const guardians = await listAllGuardians();

        // Fetch associated resident names
        const guardiansWithResidents = await Promise.all(
            guardians.map(async (guardian) => {
                const residentNames = await Promise.all(
                    (guardian.residentIds || []).map(async (residentId) => {
                        const resident = await getResidentById(residentId);
                        return resident ? resident.name : 'Unknown Resident';
                    })
                );
                return {...guardian, residentNames};
            })
        );

        return NextResponse.json(guardiansWithResidents);
    } catch (error) {
        return internalServerError(error, 'GetGuardians');
    }
}

export async function POST(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireCareAccess(userId);

        const body = await request.json();
        const {name, email, phone, residentIds, relationship, address} = body;

        if (!name || !email || !phone || !residentIds) {
            return NextResponse.json({error: 'Missing required fields: name, email, phone, residentIds'}, {status: 400});
        }

        const newGuardian = await insertGuardian({
            name,
            email,
            phone,
            residentIds,
            createdBy: userId,
            relationship,
            address,
        });

        await logAudit({
            clerkUserId: userId,
            event: 'CREATE_GUARDIAN_SUCCESS',
            details: `Guardian ${newGuardian.name} created.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({id: newGuardian.id}, {status: 201});
    } catch (error) {
        return internalServerError(error, 'CreateGuardian');
    }
}
