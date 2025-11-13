import {db} from '../index';
import {employees} from '../schema';
import {eq} from 'drizzle-orm';

export async function createEmployee(data: {
	name: string;
	workEmail: string;
	email: string;
	clerkUserId: string;
	role: string;
	locations: string[];
	employmentStatus: string;
	assignedDeviceId?: string;
	createdAt: Date;
	onboardedAt: Date;
}) {
	const [employee] = await db.insert(employees).values(data).returning();
	return employee;
}

export async function updateEmployee(
	clerkUserId: string,
	data: Partial<{
		name: string;
		email: string;
		workEmail: string;
		role: string;
		locations: string[];
		assignedDeviceId: string;
		updatedAt: Date;
	}>
) {
	await db
		.update(employees)
		.set(data)
		.where(eq(employees.clerkUserId, clerkUserId));
}

export async function deleteEmployee(clerkUserId: string) {
	await db.delete(employees).where(eq(employees.clerkUserId, clerkUserId));
}

export async function getAllEmployees() {
	return await db.query.employees.findMany();
}

export async function getEmployeeByClerkId(id: string) {
	return await db.query.employees.findFirst({
		where: eq(employees.id, id),
	});
}
