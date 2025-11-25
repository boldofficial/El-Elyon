// src/db/queries/employee-hr.ts

import {db} from '../index';
import {employees, employeeTrainings} from '../schema';
import {eq, desc} from 'drizzle-orm';
import {requireAdminAccess} from '@/lib/db-helpers';

export async function getEmployeeHRDetails(
	employeeId: string,
	clerkUserId: string
) {
	await requireAdminAccess(clerkUserId);

	const employee = await db.query.employees.findFirst({
		where: eq(employees.id, employeeId),
	});

	return employee;
}

export async function listEmployeeTrainings(
	employeeId: string,
	clerkUserId: string
) {
	await requireAdminAccess(clerkUserId);

	const trainings = await db.query.employeeTrainings.findMany({
		where: eq(employeeTrainings.employeeId, employeeId),
		orderBy: [desc(employeeTrainings.trainingYear)],
	});

	return trainings;
}

export async function getEmployeeTrainingsByYear(
	employeeId: string,
	year: number,
	clerkUserId: string
) {
	await requireAdminAccess(clerkUserId);

	const trainings = await db.query.employeeTrainings.findMany({
		where: (employeeTrainings, {and, eq}) =>
			and(
				eq(employeeTrainings.employeeId, employeeId),
				eq(employeeTrainings.trainingYear, year)
			),
	});

	return trainings;
}

export async function getTrainingById(trainingId: string, clerkUserId: string) {
	await requireAdminAccess(clerkUserId);

	const training = await db.query.employeeTrainings.findFirst({
		where: eq(employeeTrainings.id, trainingId),
	});

	return training;
}
