import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {listEmployees, hasAdminUser, getEmployeeByEmail} from '@/db/queries/employees';
import {createEmployee} from '@/db/mutations/employees';
import {logAudit} from '@/db/mutations/audit';

// GET /api/admin/employees - List all employees (Admin only)
export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const employeesList = await listEmployees(userId);
		return NextResponse.json(employeesList);
	} catch (error: any) {
		console.error('Error listing employees:', error);
		return new NextResponse(error.message, {status: 500});
	}
}

// POST /api/admin/employees - Create employee (Admin only)
export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {name, email, role, locations, assignedDeviceId} = await req.json();

		if (!name || !email || !role || !locations) {
			return new NextResponse('Missing required fields', {status: 400});
		}

		const result = await createEmployee({name, email, role, locations, assignedDeviceId}, userId);
		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error creating employee:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'create_employee_failed',
			details: `Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
