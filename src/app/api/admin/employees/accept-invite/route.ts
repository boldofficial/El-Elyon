import {NextRequest, NextResponse} from 'next/server';
import {acceptInvite} from '@/db/mutations/employees';
import {logAudit} from '@/lib/db-helpers'; // Corrected import path for logAudit
import {internalServerError} from '@/lib/api-errors';
import {auth, clerkClient} from '@clerk/nextjs/server'; // Import auth and clerkClient
import {getInviteDetails} from '@/db/queries/employees'; // Import to verify token

// POST /api/admin/employees/accept-invite - Accept invite by token and set password (public for invite acceptance)
export async function POST(req: NextRequest) {
	const token = req.nextUrl.searchParams.get('token'); // Get token from query params
	const {password} = await req.json(); // Get password from body

	try {
		if (!token) {
			return NextResponse.json({error: 'Missing token'}, {status: 400});
		}
		if (!password || password.length < 8) {
			return NextResponse.json(
				{error: 'Password must be at least 8 characters'},
				{status: 400}
			);
		}

		const inviteDetails = await getInviteDetails(token);

		if (!inviteDetails || inviteDetails.expired || inviteDetails.hasAcceptedInvite) {
			await logAudit({
				clerkUserId: (await auth()).userId,
				event: 'accept_invite_failed',
				details: inviteDetails?.expired ? `Expired token: ${token}` : `Invalid or already accepted token: ${token}`,
				deviceId: 'system',
				location: 'server',
			});
			return NextResponse.json(
				{error: inviteDetails?.expired ? 'Invite token has expired.' : 'Invalid or already accepted invite token.'},
				{status: 400}
			);
		}

		// 1. Update Clerk user's password
		const client = await clerkClient();
		await client.users.updateUser(inviteDetails.clerkUserId as string, {
			password: password,
		});

		// 2. Accept invite in our database
		const result = await acceptInvite(token); // Pass clerkUserId to acceptInvite

		await logAudit({
			clerkUserId: inviteDetails.clerkUserId,
			event: 'employee_invite_accepted',
			details: `Employee ${inviteDetails.name} accepted invite with token ${token}`,
			deviceId: 'system', // Device ID not available here
			location: 'server', // Location not available here
		});

		return NextResponse.json(result);
	} catch (error) {
		return internalServerError(error, 'AcceptEmployeeInvite');
	}
}
