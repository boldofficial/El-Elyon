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
	clerkUserId: string,
	data: {
		email?: string;
		name?: string;
		updatedAt: Date;
	}
) {
	await db.update(users).set(data).where(eq(users.clerkUserId, clerkUserId));
}

export async function deleteUser(clerkUserId: string) {
	await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
}
