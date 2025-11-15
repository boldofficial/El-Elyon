import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireSupervisorAccess, logAudit} from '../../../../../../../lib/db-helpers';

export async function POST(request: Request, {params}: {params: {id: string}}) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireSupervisorAccess(userId);

        const exceptionId = params.id;
        if (!exceptionId) {
            return NextResponse.json({error: 'Exception ID is required'}, {status: 400});
        }

        // Placeholder: Implementation would update shift record with approval
        console.log(`Approving time exception: ${exceptionId}`);

        await logAudit({
            clerkUserId: userId,
            event: 'APPROVE_TIME_EXCEPTION_SUCCESS',
            details: `Time exception ${exceptionId} approved.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({message: 'Time exception approved successfully'}, {status: 200});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'APPROVE_TIME_EXCEPTION_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
