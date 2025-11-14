import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {generateInviteLink} from '@/db/mutations/employees';
import {logAudit} from '@/lib/db-helpers';

// POST /api/admin/employees/generate-invite-link - Generate invite link for an employee (Admin only)
export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {employeeId} = await req.json();

		if (!employeeId) {
			return new NextResponse('Missing employeeId', {status: 400});
		}

		const result = await generateInviteLink(employeeId, userId);
		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error generating invite link:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'generate_invite_link_failed',
			details: `employeeId=${req.nextUrl.searchParams.get('employeeId')}, Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
