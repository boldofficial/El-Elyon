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
	console.log('✅ User created:', data.clerkUserId);
	return user;
}

// ✅ FIX: Update by clerkUserId, not id
export async function updateUser(
	clerkUserId: string, // ✅ Changed to clerkUserId
	data: {
		email?: string;
		name?: string;
		updatedAt?: Date;
		resetToken?: string | null;
		resetTokenExpiry?: Date | null;
		passwordHash?: string; // Add for password reset
	}
) {
	await db.update(users).set(data).where(eq(users.clerkUserId, clerkUserId)); // ✅ Fixed
	console.log('✅ User updated:', clerkUserId);
}

export async function deleteUser(clerkUserId: string) {
	await db.delete(users).where(eq(users.clerkUserId, clerkUserId));
	console.log('✅ User deleted:', clerkUserId);
}
