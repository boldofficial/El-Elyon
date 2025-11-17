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
