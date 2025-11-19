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
