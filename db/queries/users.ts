// db/queries/users.ts

import {db} from '../index';
import {users, employees, roles} from '../schema';
import {eq} from 'drizzle-orm';
import {getActiveAdminPrivileges} from '@/db/queries/admin-privileges';

export async function getUserByClerkId(clerkUserId: string) {
	return await db.query.users.findFirst({
		where: eq(users.clerkUserId, clerkUserId),
	});
}

export async function getUserByEmail(email: string) {
	return await db.query.users.findFirst({
		where: eq(users.email, email),
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

	// Check if user needs sync (missing records)
	const needsSync = !user || !employee || !role;
	if (needsSync) {
		console.log('⚠️  User incomplete - needs sync');
		return null;
	}

	const assignedLocations = Array.from(
		new Set([...(role.locations || []), ...(employee.locations || [])])
	);

	return {
		id: user.id,
		clerkUserId: user.clerkUserId,
		email: user.email,
		name: user.name,
		role: role.role?.toLowerCase(),
		adminPrivileges: await getActiveAdminPrivileges(clerkUserId),
		locations: assignedLocations,
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
