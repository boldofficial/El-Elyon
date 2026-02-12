// src/app/api/admin/employees/[id]/trainings/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {
	createEmployeeTraining,
	updateEmployeeTraining,
	deleteEmployeeTraining,
	toggleTrainingCompletion,
} from '@/db/mutations/employee-hr';
import {db} from '@/db/index';
import {employeeTrainings} from '@/db/schema';
import {eq, and} from 'drizzle-orm';

// GET - List employee trainings
export async function GET(
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
		const trainings = await db.query.employeeTrainings.findMany({
			where: eq(employeeTrainings.employeeId, employeeId),
			orderBy: (trainings, {desc}) => [desc(trainings.trainingYear)],
		});

		return NextResponse.json(trainings);
	} catch (error) {
		return internalServerError(error, 'GetEmployeeTrainings');
	}
}

// POST - Create a new employee training
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

		const newTraining = await createEmployeeTraining({
			employeeId,
			trainingName: body.trainingName,
			trainingYear: body.trainingYear,
			completed: body.completed,
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
			details: `Created training ${newTraining.id} for employee ${employeeId}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json(newTraining, {status: 201});
	} catch (error) {
		return internalServerError(error, 'CreateEmployeeTraining');
	}
}

// PATCH - Update an existing employee training or toggle completion
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
		const trainingId = body.trainingId;

		if (!trainingId) {
			return NextResponse.json(
				{error: 'Training ID is required for PATCH'},
				{status: 400}
			);
		}

		let updatedTraining;
		if (typeof body.completed === 'boolean') {
			updatedTraining = await toggleTrainingCompletion(
				trainingId,
				body.completed,
				userId
			);
			await logAudit({
				clerkUserId: userId,
				event: 'TOGGLE_EMPLOYEE_TRAINING_COMPLETION',
				details: `Toggled training ${trainingId} completion to ${body.completed} for employee ${employeeId}`,
				deviceId: 'system',
				location: '',
			});
		} else {
			updatedTraining = await updateEmployeeTraining(trainingId, {
				trainingName: body.trainingName,
				trainingYear: body.trainingYear,
				completedDate: body.completedDate
					? new Date(body.completedDate)
					: undefined,
				certificateFileId: body.certificateFileId,
				notes: body.notes,
				updatedBy: userId,
			});
			await logAudit({
				clerkUserId: userId,
				event: 'UPDATE_EMPLOYEE_TRAINING',
				details: `Updated training ${trainingId} for employee ${employeeId}`,
				deviceId: 'system',
				location: '',
			});
		}

		return NextResponse.json(updatedTraining);
	} catch (error) {
		return internalServerError(error, 'UpdateEmployeeTraining');
	}
}

// DELETE - Delete an employee training
export async function DELETE(
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
		const {trainingId} = await request.json();

		if (!trainingId) {
			return NextResponse.json(
				{error: 'Training ID is required for DELETE'},
				{status: 400}
			);
		}

		await deleteEmployeeTraining(trainingId);

		await logAudit({
			clerkUserId: userId,
			event: 'DELETE_EMPLOYEE_TRAINING',
			details: `Deleted training ${trainingId} for employee ${employeeId}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json({success: true});
	} catch (error) {
		return internalServerError(error, 'DeleteEmployeeTraining');
	}
}
