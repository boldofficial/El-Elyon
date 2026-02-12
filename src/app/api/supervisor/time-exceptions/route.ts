import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireSupervisorAccess} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';

export async function GET() {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireSupervisorAccess(userId);

        // For now, return empty array - time exceptions would be implemented
        // based on shift data analysis and a dedicated 'time_exceptions' table.
        const pendingTimeExceptions: any[] = [];

        return NextResponse.json(pendingTimeExceptions);
    } catch (error) {
        return internalServerError(error, 'GetTimeExceptions');
    }
}
