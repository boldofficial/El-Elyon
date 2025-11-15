import {db} from '../index';
import {users, employees, roles} from '../schema';
import {eq} from 'drizzle-orm';

export async function getUserByClerkId(clerkUserId: string) {
	return await db.query.users.findFirst({
		where: eq(users.clerkUserId, clerkUserId),
	});
}

export async function getEmployeeByClerkId(clerkUserId: string) {
	return await db.query.employees.findFirst({
		where: eq(employees.clerkUserId, clerkUserId),
	});
}

export async function getRoleByClerkId(clerkUserId: string) {
	return await db.query.roles.findFirst({
		where: eq(roles.clerkUserId, clerkUserId),
	});
}

export async function getFullUserData(clerkUserId: string) {
	const [user, employee, role] = await Promise.all([
		getUserByClerkId(clerkUserId),
		getEmployeeByClerkId(clerkUserId),
		getRoleByClerkId(clerkUserId),
	]);

	if (!user || !employee || !role) {
		return null;
	}

	return {
		id: user.id,
		clerkUserId: user.clerkUserId,
		email: user.email,
		name: user.name,
		role: role.role,
		locations: role.locations || employee.locations || [],
		employmentStatus: employee.employmentStatus,
		assignedDeviceId: employee.assignedDeviceId,
		employeeId: employee.id,
	};
}

export async function checkForAdmins() {
	return await db.query.roles.findMany({
		where: eq(roles.role, 'admin'),
	});
}
