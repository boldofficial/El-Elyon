import {db} from '../index';
import {roles} from '../schema';
import {eq} from 'drizzle-orm';

export async function getRoleByClerkId(clerkUserId: string) {
	const [role] = await db
		.select()
		.from(roles)
		.where(eq(roles.clerkUserId, clerkUserId));
	return role ? {...role, role: role.role?.toLowerCase()} : role;
}

export async function checkForAdmins() {
	const admins = await db.query.roles.findMany({
		where: eq(roles.role, 'admin'),
	})
	return admins;
}

// Get all roles (admin only)

export async function listAllRoles() {
	return await db.query.roles.findMany();
}


///////
