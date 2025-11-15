import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess, requireAdminAccess, logAudit} from '../../../../../lib/db-helpers';
import {updateGuardian, deleteGuardian} from '../../../../../db/mutations/guardians';

export async function PATCH(request: Request, {params}: {params: {id: string}}) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireCareAccess(userId);

        const guardianId = params.id;
        if (!guardianId) {
            return NextResponse.json({error: 'Guardian ID is required'}, {status: 400});
        }

        const body = await request.json();
        const {name, email, phone, residentIds, relationship, address} = body;

        await updateGuardian(guardianId, {name, email, phone, residentIds, relationship, address});

        await logAudit({
            clerkUserId: userId,
            event: 'UPDATE_GUARDIAN_SUCCESS',
            details: `Guardian ${guardianId} updated.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({message: 'Guardian updated successfully'}, {status: 200});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'UPDATE_GUARDIAN_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}

export async function DELETE(request: Request, {params}: {params: {id: string}}) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId); // Only admin can delete guardians

        const guardianId = params.id;
        if (!guardianId) {
            return NextResponse.json({error: 'Guardian ID is required'}, {status: 400});
        }

        await deleteGuardian(guardianId);

        await logAudit({
            clerkUserId: userId,
            event: 'DELETE_GUARDIAN_SUCCESS',
            details: `Guardian ${guardianId} deleted.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({message: 'Guardian deleted successfully'}, {status: 200});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'DELETE_GUARDIAN_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
