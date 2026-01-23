import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {updateEmployee, deleteEmployee} from '@/db/mutations/employees';
import {logAudit} from '@/db/mutations/audit';

// PUT /api/admin/employees/[id] - Update employee (Admin only)
export async function PUT(
	req: Request,
	{params}: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {id: employeeId} = await params;
		const {name, email, role, locations, assignedDeviceId} = await req.json();

		if (!name || !email || !role || !locations) {
			return new NextResponse('Missing required fields', {status: 400});
		}

		await updateEmployee(
			{employeeId, name, email, role, locations, assignedDeviceId},
			userId
		);
		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('Error updating employee:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'update_employee_failed',
			details: `employeeId=${params}, Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}

// PATCH /api/admin/employees/[id] - Update employee (Admin only) - alias for PUT
export async function PATCH(
	req: Request,
	context: {params: Promise<{id: string}>}
) {
	return PUT(req, context);
}

// DELETE /api/admin/employees/[id] - Delete employee (Admin only)
export async function DELETE(
	req: Request,
	{params}: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const {id: employeeId} = await params;
		await deleteEmployee(employeeId, userId);
		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('Error deleting employee:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'delete_employee_failed',
			details: `employeeId=${params}, Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}

