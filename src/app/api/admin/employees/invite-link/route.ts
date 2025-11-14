import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {getInviteLink} from '@/db/queries/employees';
import {logAudit} from '@/db/mutations/audit';

// GET /api/admin/employees/invite-link?employeeId=[id] - Get invite link for an employee (Admin only)
export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {searchParams} = new URL(req.url);
		const employeeId = searchParams.get('employeeId');

		if (!employeeId) {
			return new NextResponse('Missing employeeId', {status: 400});
		}

		const inviteLink = await getInviteLink(employeeId, userId);
		return NextResponse.json(inviteLink);
	} catch (error: any) {
		console.error('Error getting invite link:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'get_invite_link_failed',
			details: `Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
