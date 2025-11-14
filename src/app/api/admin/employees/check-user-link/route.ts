import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {checkUserEmployeeLink} from '@/db/queries/employees';
import {logAudit} from '@/db/mutations/audit';

// GET /api/admin/employees/check-user-link - Check if authenticated user needs to be linked to employee
export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const linkStatus = await checkUserEmployeeLink(userId);
		return NextResponse.json(linkStatus);
	} catch (error: any) {
		console.error('Error checking user employee link:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'check_user_employee_link_failed',
			details: `Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
