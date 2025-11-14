import {NextRequest, NextResponse} from 'next/server';
import {acceptInvite} from '@/db/mutations/employees';
import {logAudit} from '@/db/mutations/audit';
import {auth} from '@clerk/nextjs/server'; // Import auth for logging purposes

// POST /api/admin/employees/accept-invite - Accept invite by token (public for invite acceptance)
export async function POST(req: NextRequest) {
	try {
		const {token} = await req.json();

		if (!token) {
			return new NextResponse('Missing token', {status: 400});
		}

		const result = await acceptInvite(token);
		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error accepting invite:', error);
		await logAudit({
			clerkUserId: (await auth()).userId, // Log if possible, even if public route
			event: 'accept_invite_failed',
			details: `Token: ${req.nextUrl.searchParams.get('token')}, Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
