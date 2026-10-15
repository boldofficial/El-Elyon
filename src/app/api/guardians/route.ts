// src/app/api/guardians/route.ts


import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {AccessDeniedError, requireCareAccess, logAudit, scopedLocations} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {listAllGuardians, getResidentById, residentIdsInLocations} from '@/db/queries/people';
import {insertGuardian} from '@/db/mutations/guardians';

export async function GET(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        const userRole = await requireCareAccess(userId);

        let guardians = await listAllGuardians();

        // Non-admins only see guardians of residents in their own locations,
        // and only the links to those residents.
        const allowedLocations = scopedLocations(userRole);
        if (allowedLocations) {
            const inScope = await residentIdsInLocations(allowedLocations);
            guardians = guardians
                .map((guardian) => ({
                    ...guardian,
                    residentIds: (guardian.residentIds || []).filter((id) => inScope.has(id)),
                }))
                .filter((guardian) => guardian.residentIds.length > 0);
        }

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
        if (error instanceof AccessDeniedError) {
            return NextResponse.json({error: 'Access denied'}, {status: 403});
        }
        return internalServerError(error, 'GetGuardians');
    }
}

export async function POST(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        const userRole = await requireCareAccess(userId);

        const body = await request.json();
        const {name, email, phone, residentIds, relationship, address} = body;

        if (!name || !email || !phone || !Array.isArray(residentIds)) {
            return NextResponse.json({error: 'Missing required fields: name, email, phone, residentIds'}, {status: 400});
        }

        // Non-admins may only link a guardian to residents in their own locations.
        const allowedLocations = scopedLocations(userRole);
        if (allowedLocations) {
            const inScope = await residentIdsInLocations(allowedLocations);
            if (!residentIds.every((id: string) => inScope.has(id))) {
                await logAudit({
                    clerkUserId: userId,
                    event: 'access_denied',
                    details: 'guardian_create_cross_location',
                    deviceId: 'system',
                    location: '',
                });
                return NextResponse.json({error: 'Access denied'}, {status: 403});
            }
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
        if (error instanceof AccessDeniedError) {
            return NextResponse.json({error: 'Access denied'}, {status: 403});
        }
        return internalServerError(error, 'CreateGuardian');
    }
}
