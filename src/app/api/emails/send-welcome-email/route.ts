import { NextResponse } from 'next/server';
import { sendWelcomeEmailWithCredentials } from '@/lib/emails';
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

        const { employeeId, email, password } = await req.json();

        if (!employeeId || !email || !password) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const result = await sendWelcomeEmailWithCredentials({ employeeId, email, password });

        if (result.success) {
            return NextResponse.json({ message: 'Welcome email sent successfully', emailId: result.emailId });
        } else {
            return NextResponse.json({ error: result.error || 'Failed to send welcome email' }, { status: 500 });
        }
    } catch (error) {
        console.error('API Error sending welcome email:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Internal server error' },
            { status: 500 }
        );
    }
}
