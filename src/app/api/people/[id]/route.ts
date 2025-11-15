import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '../../../../../lib/db-helpers';
import {deleteResident} from '../../../../../db/mutations/people';

export async function DELETE(request: Request, {params}: {params: {id: string}}) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const residentId = params.id;
        if (!residentId) {
            return NextResponse.json({error: 'Resident ID is required'}, {status: 400});
        }

        await deleteResident(residentId);

        await logAudit({
            clerkUserId: userId,
            event: 'DELETE_RESIDENT_SUCCESS',
            details: `Resident ${residentId} deleted.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({message: 'Resident deleted successfully'}, {status: 200});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'DELETE_RESIDENT_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
