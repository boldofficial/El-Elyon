//  src/app/api/admin/employees/[id]/trainings/[trainingId]/route.ts
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {
	updateEmployeeTraining,
	deleteEmployeeTraining,
	toggleTrainingCompletion,
} from '@/db/mutations/employee-hr';

// PATCH - Update training record
export async function PATCH(
	request: Request,
	{params}: {params: Promise<{id: string; trainingId: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {id: employeeId, trainingId} = await params;
		const body = await request.json();

		// Check if this is just a completion toggle
		if (body.toggleCompletion !== undefined) {
			const updated = await toggleTrainingCompletion(
				trainingId,
				body.toggleCompletion,
				userId
			);
			await logAudit({
				clerkUserId: userId,
				event: 'TOGGLE_EMPLOYEE_TRAINING_COMPLETION',
				details: `Toggled training ${trainingId} completion for employee ${employeeId}`,
				deviceId: 'system',
				location: '',
			});
			return NextResponse.json(updated);
		}

		// Full update
		const updated = await updateEmployeeTraining(trainingId, {
			trainingName: body.trainingName,
			trainingYear: body.trainingYear,
			completed: body.completed,
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

		return NextResponse.json(updated);
	} catch (error) {
		return internalServerError(error, 'UpdateTraining');
	}
}

// DELETE - Delete training record
export async function DELETE(
	request: Request,
	{params}: {params: Promise<{id: string; trainingId: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {id: employeeId, trainingId} = await params;
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
		return internalServerError(error, 'DeleteTraining');
	}
}
