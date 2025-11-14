import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {linkUserToEmployee} from '@/db/mutations/employees';
import {logAudit} from '@/db/mutations/audit';

// POST /api/admin/employees/link-user - Link authenticated Clerk user to employee record and create role
export async function POST(req: NextRequest) {
	try {
		const {userId, user} = await auth();
		if (!userId || !user?.emailAddresses?.[0]?.emailAddress) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {employeeId} = await req.json();

		if (!employeeId) {
			return new NextResponse('Missing employeeId', {status: 400});
		}

		const userEmail = user.emailAddresses[0].emailAddress;
		const result = await linkUserToEmployee(employeeId, userId, userEmail);
		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error linking user to employee:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'link_user_to_employee_failed',
			details: `employeeId=${req.nextUrl.searchParams.get('employeeId')}, Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
