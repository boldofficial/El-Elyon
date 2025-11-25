import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {auditLogs} from '@/db/schema';
import {InferSelectModel} from 'drizzle-orm';

type AuditLogSelect = InferSelectModel<typeof auditLogs>;

export async function GET() {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const logs = await db.query.auditLogs.findMany();
        const locations = [
            ...new Set(logs.map((log: AuditLogSelect) => log.location).filter(Boolean)),
        ];

        return NextResponse.json(locations.sort());
    } catch (error: any) {
        console.error('Error getting audit locations:', error);
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
