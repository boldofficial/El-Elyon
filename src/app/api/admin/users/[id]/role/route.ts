import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {updateRole, deleteRole} from '@/db/mutations/roles';

export async function PATCH(request: Request, {params}: {params: Promise<{id: string}>}) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const {id: targetClerkUserId} = await params;
        if (!targetClerkUserId) {
            return NextResponse.json({error: 'User ID is required'}, {status: 400});
        }

        const body = await request.json();
        const {role: newRole, locations} = body;

        // Basic validation (can be enhanced with Zod)
        if (!newRole || !['admin', 'supervisor', 'staff'].includes(newRole)) {
            return NextResponse.json({error: 'Invalid role provided'}, {status: 400});
        }
        if (!Array.isArray(locations)) {
            return NextResponse.json({error: 'Locations must be an array'}, {status: 400});
        }

        await updateRole(targetClerkUserId, {role: newRole, locations});

        await logAudit({
            clerkUserId: userId,
            event: 'UPDATE_USER_ROLE_SUCCESS',
            details: `User ${targetClerkUserId} role updated to ${newRole} with locations ${locations.join(',')}.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({message: 'User role updated successfully'}, {status: 200});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'UPDATE_USER_ROLE_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}

export async function DELETE(request: Request, {params}: {params: Promise<{id: string}>}) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const {id: targetClerkUserId} = await params;
        if (!targetClerkUserId) {
            return NextResponse.json({error: 'User ID is required'}, {status: 400});
        }

        await deleteRole(targetClerkUserId);

        await logAudit({
            clerkUserId: userId,
            event: 'DELETE_USER_ROLE_SUCCESS',
            details: `User ${targetClerkUserId} role deleted.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({message: 'User role deleted successfully'}, {status: 200});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'DELETE_USER_ROLE_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
