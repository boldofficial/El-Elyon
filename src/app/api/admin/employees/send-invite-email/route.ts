import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminOrPrivilege, logAudit} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {sendEmployeeInviteEmail} from '@/lib/emails/employee';

export async function POST(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        await requireAdminOrPrivilege(userId, 'manage_employees');

        const body = await request.json();
        const {email, name, inviteUrl, role, locations} = body;

        if (!email || !name || !inviteUrl || !role || !locations) {
            return NextResponse.json({error: 'Missing required fields: email, name, inviteUrl, role, locations'}, {status: 400});
        }

        await sendEmployeeInviteEmail({email, name, inviteUrl, role, locations});

        await logAudit({
            clerkUserId: userId,
            event: 'SEND_EMPLOYEE_INVITE_EMAIL_SUCCESS',
            details: `Invite email sent to ${email} for employee ${name}.`,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({message: 'Employee invite email sent successfully'}, {status: 200});
    } catch (error) {
        return internalServerError(error, 'SendEmployeeInviteEmail');
    }
}
