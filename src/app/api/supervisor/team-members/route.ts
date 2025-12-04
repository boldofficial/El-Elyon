import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireSupervisorAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {roles, employees, shifts} from '@/db/schema'; // Include shifts for future clock-in status
import {eq, InferSelectModel} from 'drizzle-orm';

type RoleSelect = InferSelectModel<typeof roles>;
type EmployeeSelect = InferSelectModel<typeof employees>;

export async function GET() {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        const userRole = await requireSupervisorAccess(userId);

        // Get all staff roles
        const allRoles = await db.query.roles.findMany();
        const teamRoles = allRoles.filter(
            (role: RoleSelect) =>
                role.role === 'staff' &&
                role.locations &&
                role.locations.some((loc: string) => (userRole.locations || []).includes(loc))
        );

        // Get user details and shift status for each team member
        const teamMembers = await Promise.all(
            teamRoles.map(async (role: RoleSelect) => {
                const employee = await db.query.employees.findFirst({
                    where: eq(employees.clerkUserId, role.clerkUserId),
                });
                if (!employee) return null;

                // Check if currently clocked in - Placeholder for now
                // This would involve querying the shifts table for an open shift for this employee
                const isCurrentlyClocked = false;
                const lastClockIn = null;

                return {
                    id: role.clerkUserId,
                    name: employee.name || 'Unknown',
                    role: role.role,
                    locations: role.locations
                        ? role.locations.filter((loc: string) => (userRole.locations || []).includes(loc))
                        : [],
                    isCurrentlyClocked,
                    lastClockIn,
                };
            })
        );

        return NextResponse.json(teamMembers.filter(Boolean));
    } catch (error: any) {
        console.error('Error getting team members:', error);
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
