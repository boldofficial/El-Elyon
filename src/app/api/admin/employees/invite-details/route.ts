import {NextRequest, NextResponse} from 'next/server';
import {getInviteDetails} from '@/db/queries/employees';
import {logAudit} from '@/db/mutations/audit';
import {auth} from '@clerk/nextjs/server'; // Import auth for logging purposes

// GET /api/admin/employees/invite-details?token=[token] - Get invite details by token (public for invite acceptance)
export async function GET(req: NextRequest) {
	try {
		const {searchParams} = new URL(req.url);
		const token = searchParams.get('token');

		if (!token) {
			return new NextResponse('Missing token', {status: 400});
		}

		const inviteDetails = await getInviteDetails(token);
		return NextResponse.json(inviteDetails);
	} catch (error: any) {
		console.error('Error getting invite details:', error);
		await logAudit({
			clerkUserId: (await auth()).userId, // Log if possible, even if public route
			event: 'get_invite_details_failed',
			details: `Token: ${req.nextUrl.searchParams.get('token')}, Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
