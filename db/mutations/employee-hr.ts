// src/db/mutations/employee-hr.ts

import {db} from '../index';
import {employees, employeeTrainings} from '../schema';
import {eq} from 'drizzle-orm';

// ============================
// Employee HR Document Updates
// ============================

export async function updateEmployeeHRDocs(
	employeeId: string,
	data: {
		dateOfHire?: Date;
		tbTestFileId?: string;
		tbTestExpiresAt?: Date;
		backgroundCheckFileId?: string;
		backgroundCheckExpiresAt?: Date;
		applicationFormFileId?: string;
		personalBio?: string;
	}
) {
	const [updated] = await db
		.update(employees)
		.set({
			...data,
			updatedAt: new Date(),
		})
		.where(eq(employees.id, employeeId))
		.returning();

	return updated;
}

// ============================
// Employee Training Management
// ============================

export async function createEmployeeTraining(data: {
	employeeId: string;
	trainingName: string;
	trainingYear: number;
	completed?: boolean;
	completedDate?: Date;
	certificateFileId?: string;
	notes?: string;
	createdBy: string;
}) {
	const [training] = await db
		.insert(employeeTrainings)
		.values({
			employeeId: data.employeeId,
			trainingName: data.trainingName,
			trainingYear: data.trainingYear,
			completed: data.completed ?? false,
			completedDate: data.completedDate,
			certificateFileId: data.certificateFileId,
			notes: data.notes,
			createdBy: data.createdBy,
			createdAt: new Date(),
		})
		.returning();

	return training;
}

export async function updateEmployeeTraining(
	trainingId: string,
	data: {
		trainingName?: string;
		trainingYear?: number;
		completed?: boolean;
		completedDate?: Date;
		certificateFileId?: string;
		notes?: string;
		updatedBy: string;
	}
) {
	const [updated] = await db
		.update(employeeTrainings)
		.set({
			...data,
			updatedAt: new Date(),
		})
		.where(eq(employeeTrainings.id, trainingId))
		.returning();

	return updated;
}

export async function deleteEmployeeTraining(trainingId: string) {
	await db
		.delete(employeeTrainings)
		.where(eq(employeeTrainings.id, trainingId));
}

export async function toggleTrainingCompletion(
	trainingId: string,
	completed: boolean,
	updatedBy: string
) {
	const [updated] = await db
		.update(employeeTrainings)
		.set({
			completed,
			completedDate: completed ? new Date() : null,
			updatedBy,
			updatedAt: new Date(),
		})
		.where(eq(employeeTrainings.id, trainingId))
		.returning();

	return updated;
}
