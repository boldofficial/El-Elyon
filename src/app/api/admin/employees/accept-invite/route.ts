import {NextRequest, NextResponse} from 'next/server';
import {acceptInvite} from '@/db/mutations/employees';
import {logAudit} from '@/lib/db-helpers'; // Corrected import path for logAudit
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

		if (!inviteDetails || !inviteDetails.valid || !inviteDetails.employee) {
			await logAudit({
				clerkUserId: (await auth()).userId,
				event: 'accept_invite_failed',
				details: `Invalid or expired token: ${token}`,
				deviceId: 'system',
				location: 'server',
			});
			return NextResponse.json(
				{error: inviteDetails?.message || 'Invalid or expired invite token'},
				{status: 400}
			);
		}

		const {employee} = inviteDetails;

		// 1. Update Clerk user's password
		const client = await clerkClient();
		await client.users.updateUser(employee.clerkUserId, {
			password: password,
		});

		// 2. Accept invite in our database
		const result = await acceptInvite(token, employee.clerkUserId); // Pass clerkUserId to acceptInvite

		await logAudit({
			clerkUserId: employee.clerkUserId,
			event: 'employee_invite_accepted',
			details: `Employee ${employee.name} accepted invite with token ${token}`,
			deviceId: 'system', // Device ID not available here
			location: 'server', // Location not available here
		});

		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error accepting invite:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'accept_invite_failed',
			details: `Token: ${token}, Error: ${error.message}`,
			deviceId: 'system',
			location: 'server',
		});
		return NextResponse.json(
			{error: error.message || 'Failed to accept invite'},
			{status: 500}
		);
	}
}
