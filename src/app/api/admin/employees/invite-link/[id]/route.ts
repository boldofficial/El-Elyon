import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {getInviteLink} from '@/db/queries/employees';

export async function GET(
	_request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {id: employeeId} = await params;
		if (!employeeId) {
			return NextResponse.json(
				{error: 'Employee ID is required'},
				{status: 400}
			);
		}

		const inviteDetails = await getInviteLink(employeeId, userId);

		if (!inviteDetails) {
			return NextResponse.json(
				{error: 'Invite link not found or expired'},
				{status: 404}
			);
		}

		await logAudit({
			clerkUserId: userId,
			event: 'GET_EMPLOYEE_INVITE_LINK_SUCCESS',
			details: `Invite link for employee ${employeeId} retrieved.`,
			deviceId: 'system', // Placeholder
			location: '', // Placeholder
		});
		return NextResponse.json(inviteDetails);
	} catch (error: any) {
		await logAudit({
			clerkUserId: userId,
			event: 'GET_EMPLOYEE_INVITE_LINK_FAILED',
			details: error.message,
			deviceId: 'system', // Placeholder
			location: '', // Placeholder
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
