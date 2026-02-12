// ==========================================
// src/app/api/admin/employees/[id]/hr/route.ts
// ==========================================
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {updateEmployeeHRDocs} from '@/db/mutations/employee-hr';
import {getEmployeeHRDetails} from '@/db/queries/employee-hr';

// GET - Get employee HR details
export async function GET(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const {id: employeeId} = await params;
		const employee = await getEmployeeHRDetails(employeeId, userId);

		if (!employee) {
			return NextResponse.json({error: 'Employee not found'}, {status: 404});
		}

		return NextResponse.json(employee);
	} catch (error) {
		return internalServerError(error, 'GetEmployeeHR');
	}
}

// PATCH - Update employee HR information
export async function PATCH(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {id: employeeId} = await params;
		const body = await request.json();

		const updated = await updateEmployeeHRDocs(employeeId, {
			dateOfHire: body.dateOfHire ? new Date(body.dateOfHire) : undefined,
			tbTestFileId: body.tbTestFileId,
			tbTestExpiresAt: body.tbTestExpiresAt
				? new Date(body.tbTestExpiresAt)
				: undefined,
			backgroundCheckFileId: body.backgroundCheckFileId,
			backgroundCheckExpiresAt: body.backgroundCheckExpiresAt
				? new Date(body.backgroundCheckExpiresAt)
				: undefined,
			applicationFormFileId: body.applicationFormFileId,
			personalBio: body.personalBio,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_EMPLOYEE_HR',
			details: `Updated HR info for employee ${employeeId}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json(updated);
	} catch (error) {
		return internalServerError(error, 'UpdateEmployeeHR');
	}
}
