import {db} from '../index';
import {roles} from '../schema';
import {eq} from 'drizzle-orm';

export async function getRoleByClerkId(clerkUserId: string) {
	const [role] = await db
		.select()
		.from(roles)
		.where(eq(roles.clerkUserId, clerkUserId));
	return role;
}

export async function checkForAdmins() {
	const admins = await db.select().from(roles).where(eq(roles.role, 'admin'));
	return admins;
}

// Get all roles (admin only)

export async function listAllRoles() {
	return await db.query.roles.findMany();
}


///////
// db/mutations/roles.ts

import {db} from '../index';
import {roles} from '../schema';
import {eq, InferInsertModel} from 'drizzle-orm';

type RoleInsert = InferInsertModel<typeof roles>;

export async function insertRole(data: RoleInsert) {
	const [newRole] = await db.insert(roles).values(data).returning();
	return newRole;
}

export async function createRole(data: {
	clerkUserId: string;
	role: string;
	locations: string[];
	assignedAt: Date;
	assignedBy?: string;
}) {
	const [role] = await db.insert(roles).values(data).returning();
	console.log(`✅ Role created: ${data.role} for ${data.clerkUserId}`);
	return role;
}

// export async function updateRole(clerkUserId: string, data: Partial<RoleInsert>) {
//     await db.update(roles).set(data).where(eq(roles.clerkUserId, clerkUserId));
// }

export async function updateRole(
	clerkUserId: string,
	data: {
		role?: string;
		locations?: string[];
	}
) {
	await db.update(roles).set(data).where(eq(roles.clerkUserId, clerkUserId));
	console.log(`✅ Role updated for ${clerkUserId}`);
	return {success: true};
}

export async function deleteRole(clerkUserId: string) {
	await db.delete(roles).where(eq(roles.clerkUserId, clerkUserId));
	console.log(`✅ Role deleted for ${clerkUserId}`);
	return {success: true};
}

////

// db/queries/users.ts

import {db} from '../index';
import {users, employees, roles} from '../schema';
import {eq} from 'drizzle-orm';

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

import {db} from '../index';
import {users} from '../schema';
import {eq} from 'drizzle-orm';

export async function createUser(data: {
	clerkUserId: string;
	email: string;
	name: string;
	createdAt: Date;
}) {
	const [user] = await db.insert(users).values(data).returning();
	return user;
}

export async function updateUser(
	id: string, // Changed to update by internal ID
	data: {
		email?: string;
		name?: string;
		updatedAt?: Date; // Made optional as it might be set by default or other mutations
		resetToken?: string | null;
		resetTokenExpiry?: Date | null;
		passwordHash?: string; // Add for password reset
	}
) {
	await db.update(users).set(data).where(eq(users.id, id));
}

export async function deleteUser(clerkUserId: string) {
	await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
}
