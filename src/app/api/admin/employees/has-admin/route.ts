import {NextRequest, NextResponse} from 'next/server';
import {hasAdminUser} from '@/db/queries/employees';
import {logAudit} from '@/db/mutations/audit';
import {auth} from '@clerk/nextjs/server'; // Import auth for logging purposes

// GET /api/admin/employees/has-admin - Check if any admin user exists in the system (Public)
export async function GET(req: NextRequest) {
	try {
		const adminExists = await hasAdminUser();
		return NextResponse.json({hasAdmin: adminExists});
	} catch (error: any) {
		console.error('Error checking for admin user:', error);
		await logAudit({
			clerkUserId: (await auth()).userId, // Log if possible, even if public route
			event: 'has_admin_user_failed',
			details: `Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
