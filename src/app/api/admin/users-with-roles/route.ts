import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {employees, roles, auditLogs} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function GET() {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const employeesList = await db.query.employees.findMany();
        const rolesList = await db.query.roles.findMany();
        const auditLogsList = await db.query.auditLogs.findMany({
            orderBy: (auditLogs, {desc}) => [desc(auditLogs.timestamp)],
            limit: 1000,
        });

        const usersWithRoles = employeesList.map((employee) => {
            const role = rolesList.find((r) => r.clerkUserId === employee.clerkUserId);
            const lastActivity = auditLogsList.find(
                (log) => log.clerkUserId === employee.clerkUserId
            );

            return {
                id: employee.clerkUserId,
                name: employee.name || employee.workEmail || 'Unknown User',
                email: employee.workEmail || 'No email',
                role: role?.role || null,
                locations: role?.locations || [],
                lastActive: lastActivity?.timestamp || null,
                recentActivity: auditLogsList
                    .filter((log) => log.clerkUserId === employee.clerkUserId)
                    .slice(0, 5)
                    .map((log) => ({
                        event: log.event,
                        timestamp: log.timestamp,
                        location: log.location,
                    })),
            };
        });

        return NextResponse.json(usersWithRoles);
    } catch (error: any) {
        console.error('Error getting all users with roles:', error);
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
