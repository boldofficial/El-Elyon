import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '../../../../../../lib/db-helpers';
import {createEmployee, generateInviteLink} from '../../../../../../db/mutations/employees';
import {getEmployeeByClerkId} from '../../../../../../db/queries/employees'; // Assuming this function exists

export async function POST(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminAccess(userId);

        const body = await request.json();
        const {name, email, role, locations} = body;

        if (!name || !email || !role || !locations) {
            return NextResponse.json({error: 'Missing required fields: name, email, role, locations'}, {status: 400});
        }

        // Create the employee and their initial role
        const {clerkUserId} = await createEmployee({name, email, role, locations}, userId);

        // Fetch the employeeId using the clerkUserId
        const employee = await getEmployeeByClerkId(clerkUserId);
        if (!employee) {
            throw new Error('Failed to retrieve employee after creation.');
        }
        const employeeId = employee.id;

        // Generate an invite link for the newly created employee
        const {token: inviteToken, expiresAt: inviteExpiresAt, url: inviteUrl} = await generateInviteLink(employeeId, userId);

        await logAudit({
            clerkUserId: userId,
            event: 'ONBOARD_EMPLOYEE_SUCCESS',
            details: `Employee ${name} onboarded.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });

        return NextResponse.json({
            employeeId,
            inviteToken,
            inviteUrl,
            email,
            name,
            role,
            locations,
        }, {status: 201});
    } catch (error: any) {
        await logAudit({
            clerkUserId: userId,
            event: 'ONBOARD_EMPLOYEE_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
