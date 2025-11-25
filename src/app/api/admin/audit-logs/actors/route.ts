import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {employees, roles} from '@/db/schema';
import {InferSelectModel} from 'drizzle-orm';

type EmployeeSelect = InferSelectModel<typeof employees>;
type RoleSelect = InferSelectModel<typeof roles>;

export async function GET() {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const employeesList = await db.query.employees.findMany();
        const rolesList = await db.query.roles.findMany();

        const auditActors = employeesList.map((employee: EmployeeSelect) => {
            const role = rolesList.find((r: RoleSelect) => r.clerkUserId === employee.clerkUserId);
            return {
                id: employee.clerkUserId,
                name: employee.name || employee.workEmail || 'Unknown User',
                role: role?.role || 'No role',
            };
        });

        return NextResponse.json(auditActors);
    } catch (error: any) {
        console.error('Error getting audit actors:', error);
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
