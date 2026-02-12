// src/app/api/uploads/fire-evac-url/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, requireCareAccess, logAudit} from '@/lib/db-helpers'; // Path adjusted for uploads directory
import {internalServerError} from '@/lib/api-errors';

export async function GET(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        // Check for admin or care access (supervisor role specifically mentioned)
        let hasAccess = false;
        try {
            await requireAdminAccess(userId);
            hasAccess = true;
        } catch (adminError) {
            try {
                const userRole = await requireCareAccess(userId);
                if (userRole.role === 'supervisor') { // Specific check for supervisor role
                    hasAccess = true;
                }
            } catch (careError) {
                // No access
            }
        }

        if (!hasAccess) {
            await logAudit({
                clerkUserId: userId,
                event: 'GENERATE_FIRE_EVAC_UPLOAD_URL_ACCESS_DENIED',
                details: 'User does not have required admin or supervisor access.',
                deviceId: 'system', // Placeholder
                location: '', // Placeholder
            });
            return NextResponse.json({error: 'Forbidden: Admin or Supervisor access required'}, {status: 403});
        }

        // Simulate generating a pre-signed upload URL
        const simulatedUploadUrl = `https://example.com/upload/fire-evac-${Date.now()}.pdf`;

        await logAudit({
            clerkUserId: userId,
            event: 'GENERATE_FIRE_EVAC_UPLOAD_URL_SUCCESS',
            details: 'Pre-signed upload URL generated for fire evacuation file.',
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({uploadUrl: simulatedUploadUrl});
    } catch (error) {
        return internalServerError(error, 'GenerateFireEvacUploadURL');
    }
}
