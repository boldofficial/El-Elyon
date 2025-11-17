import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {auditLogs, employees} from '@/db/schema';
import {eq, and, gte, lte, desc, InferSelectModel} from 'drizzle-orm';

type AuditLogSelect = InferSelectModel<typeof auditLogs>;
type EmployeeSelect = InferSelectModel<typeof employees>;

export async function GET(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const {searchParams} = new URL(request.url);
        const actorFilter = searchParams.get('actor');
        const actionFilter = searchParams.get('action');
        const locationFilter = searchParams.get('location');
        const dateFromFilter = searchParams.get('dateFrom');
        const dateToFilter = searchParams.get('dateTo');

        const whereConditions = [];
        if (actorFilter) {
            whereConditions.push(eq(auditLogs.clerkUserId, actorFilter));
        }
        if (actionFilter) {
            whereConditions.push(eq(auditLogs.event, actionFilter));
        }
        if (locationFilter) {
            whereConditions.push(eq(auditLogs.location, locationFilter));
        }
        if (dateFromFilter) {
            whereConditions.push(gte(auditLogs.timestamp, new Date(dateFromFilter)));
        }
        if (dateToFilter) {
            whereConditions.push(lte(auditLogs.timestamp, new Date(dateToFilter)));
        }

        const logs = await db.query.auditLogs.findMany({
            where: and(...whereConditions),
            orderBy: (fields) => [desc(fields.timestamp)],
            limit: 1000, // Limit to 1000 as in Convex
        });
        const employeesList = await db.query.employees.findMany();

        const formattedLogs = logs.map((log: AuditLogSelect) => {
            const actor = log.clerkUserId
                ? employeesList.find((e: EmployeeSelect) => e.clerkUserId === log.clerkUserId)
                : null;

            // Determine object type from details (PHI-free)
            let objectType = 'System';
            if (log.details?.includes('residentId=')) objectType = 'Resident Record';
            else if (log.details?.includes('employeeId='))
                objectType = 'Employee Record';
            else if (log.details?.includes('kioskId=')) objectType = 'Kiosk Device';
            else if (log.details?.includes('alertId='))
                objectType = 'Compliance Alert';

            return {
                id: log.id,
                timestamp: log.timestamp,
                actorId: log.clerkUserId || 'system',
                actorName: actor
                    ? actor.name || actor.workEmail || 'Unknown User'
                    : 'System',
                event: log.event,
                location: log.location || 'System',
                objectType,
                deviceId: log.deviceId,
            };
        });

        return NextResponse.json(formattedLogs);
    } catch (error: any) {
        console.error('Error getting audit logs:', error);
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
