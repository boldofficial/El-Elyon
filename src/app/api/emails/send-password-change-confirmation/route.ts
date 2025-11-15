import { NextResponse } from 'next/server';
import { sendPasswordChangeConfirmation } from '@/lib/emails';
import { requireAdminAccess } from '@/lib/db-helpers';
import { auth } from '@clerk/nextjs/server';

export async function POST(req: Request) {
    try {
        const { userId } = await auth();
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        // Ensure only authenticated admins can trigger this email
        await requireAdminAccess(userId);

        const { employeeId, email } = await req.json();

        if (!employeeId || !email) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const result = await sendPasswordChangeConfirmation({ employeeId, email });

        if (result.success) {
            return NextResponse.json({ message: 'Password change confirmation email sent successfully', emailId: result.emailId });
        } else {
            return NextResponse.json({ error: result.error || 'Failed to send password change confirmation email' }, { status: 500 });
        }
    } catch (error) {
        console.error('API Error sending password change confirmation email:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
