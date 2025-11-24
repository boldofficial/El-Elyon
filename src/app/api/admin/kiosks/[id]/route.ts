import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {updateKiosk, deleteKiosk} from '@/db/mutations/kiosks';

export async function PATCH(request: Request, {params}: {params: {id: string}}) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const kioskId = params.id;
        if (!kioskId) {
            return NextResponse.json({error: 'Kiosk ID is required'}, {status: 400});
        }

        const body = await request.json();
        const {location, status, deviceLabel, name, active} = body;

        await updateKiosk(kioskId, {location, status, deviceLabel, name, active});

        await logAudit({
            clerkUserId: userId,
            event: 'UPDATE_KIOSK_SUCCESS',
            timestamp: new Date(),
            details: `Kiosk ${kioskId} updated.`,
            deviceId: '', // Kiosk ID is the deviceId here
            location: location || '',
        });
        return NextResponse.json({message: 'Kiosk updated successfully'}, {status: 200});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'UPDATE_KIOSK_FAILED',
            timestamp: new Date(),
            details: error.message,
            deviceId: '',
            location: '',
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
        await requireAdminAccess(userId);

        const kioskId = params.id;
        if (!kioskId) {
            return NextResponse.json({error: 'Kiosk ID is required'}, {status: 400});
        }

        await deleteKiosk(kioskId);

        await logAudit({
            clerkUserId: userId,
            event: 'DELETE_KIOSK_SUCCESS',
            timestamp: new Date(),
            details: `Kiosk ${kioskId} deleted.`,
            deviceId: '',
            location: '',
        });
        return NextResponse.json({message: 'Kiosk deleted successfully'}, {status: 200});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'DELETE_KIOSK_FAILED',
            timestamp: new Date(),
            details: error.message,
            deviceId: '',
            location: '',
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
