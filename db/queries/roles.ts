import {db} from '../index';
import {roles} from '../schema';
import {eq} from 'drizzle-orm';

export async function createRole(data: {
	clerkUserId: string;
	role: string;
	locations: string[];
	assignedAt: Date;
}) {
	const [role] = await db.insert(roles).values(data).returning();
	return role;
}

export async function updateRole(
	clerkUserId: string,
	data: {
		role?: string;
		locations?: string[];
	}
) {
	await db.update(roles).set(data).where(eq(roles.clerkUserId, clerkUserId));
}

export async function deleteRole(clerkUserId: string) {
	await db.delete(roles).where(eq(roles.clerkUserId, clerkUserId));
}
