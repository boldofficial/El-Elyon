// ==========================================
// src/app/api/admin/employees/[id]/trainings/route.ts
// ==========================================
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {
	createEmployeeTraining,
	updateEmployeeTraining,
} from '@/db/mutations/employee-hr';
import {listEmployeeTrainings} from '@/db/queries/employee-hr';

// GET - List all trainings for an employee
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
		const trainings = await listEmployeeTrainings(employeeId, userId);

		return NextResponse.json(trainings);
	} catch (error: any) {
		console.error('Error fetching trainings:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// POST - Create new training 
export async function POST(
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

		const training = await createEmployeeTraining({
			employeeId,
			trainingName: body.trainingName,
			trainingYear: body.trainingYear,
			completed: body.completed ?? false,
			completedDate: body.completedDate
				? new Date(body.completedDate)
				: undefined,
			certificateFileId: body.certificateFileId,
			notes: body.notes,
			createdBy: userId,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'CREATE_EMPLOYEE_TRAINING',
			details: `Created training ${body.trainingName} for employee ${employeeId}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json(training, {status: 201});
	} catch (error: any) {
		console.error('Error creating training:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
