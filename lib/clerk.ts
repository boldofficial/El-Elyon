// lib/clerk.ts

import {clerkClient} from '@clerk/nextjs/server';

export async function getClerkUser(userId: string) {
	try {
		const client = await clerkClient();
		const user = await client.users.getUser(userId);
		return {
			id: user.id,
			email: user.emailAddresses[0]?.emailAddress,
			name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
			metadata: user.publicMetadata as Record<string, any>,
		};
	} catch (error) {
		console.error('Error fetching Clerk user:', error);
		return null;
	}
}

export async function getClerkUserByEmail(email: string) {
	try {
		const client = await clerkClient();

		// Search for users by email
		const users = await client.users.getUserList({
			emailAddress: [email],
		});

		if (users.data.length === 0) {
			return null;
		}

		const user = users.data[0];

		return {
			id: user.id,
			email: user.emailAddresses[0]?.emailAddress,
			name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'User',
			metadata: user.publicMetadata as Record<string, any>,
		};
	} catch (error) {
		console.error('Error fetching Clerk user by email:', error);
		return null;
	}
}

export async function createClerkUser(args: {
	email: string;
	password: string;
	firstName: string;
	lastName: string;
	role: 'admin' | 'supervisor' | 'staff';
	locations: string[];
	assignedDeviceId?: string;
}) {
	const client = await clerkClient();
	
	// ✅ FIX: Generate valid username by removing dots and special characters
	// Clerk usernames can only contain letters, numbers, hyphens, and underscores
	const username = args.email
		.split('@')[0]
		.toLowerCase()
		.replace(/[^a-z0-9_-]/g, '_'); // Replace dots and other invalid chars with underscore
	
	console.log('🔐 Creating Clerk user with username:', username, 'for email:', args.email);

	const user = await client.users.createUser({
		emailAddress: [args.email],
		password: args.password,
		firstName: args.firstName,
		lastName: args.lastName,
		username,
		publicMetadata: {
			role: args.role,
			locations: args.locations,
			assignedDeviceId: args.assignedDeviceId,
			systemRole: 'employee',
		},
	});

	return {
		clerkUserId: user.id,
		email: user.emailAddresses[0].emailAddress,
	};
}

export async function updateClerkMetadata(
	clerkUserId: string,
	metadata: {
		role: 'admin' | 'supervisor' | 'staff';
		locations: string[];
		assignedDeviceId?: string;
	}
) {
	const client = await clerkClient();
	await client.users.updateUserMetadata(clerkUserId, {
		publicMetadata: {
			...metadata,
			systemRole: 'employee',
		},
	});
}

export async function updateClerkUser(
	userId: string,
	args: {
		email?: string;
		firstName?: string;
		lastName?: string;
	}
) {
	const maxRetries = 3;
	let lastError: any;

	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const client = await clerkClient();
			const updateData: any = {};

			if (args.email) {
				updateData.emailAddress = [args.email];
			}
			if (args.firstName !== undefined) {
				updateData.firstName = args.firstName;
			}
			if (args.lastName !== undefined) {
				updateData.lastName = args.lastName;
			}

			const user = await client.users.updateUser(userId, updateData);

			return {
				success: true,
				email: user.emailAddresses[0]?.emailAddress,
				name: `${user.firstName || ''} ${user.lastName || ''}`.trim(),
			};
		} catch (error: any) {
			lastError = error;
			console.error(`Clerk update attempt ${attempt}/${maxRetries} failed:`, error.message || error);

			// Only retry on network/fetch errors, not on validation errors
			const isNetworkError = error.message?.includes('fetch') ||
				error.message?.includes('network') ||
				error.message?.includes('timeout') ||
				error.code === 'ECONNRESET' ||
				error.code === 'ETIMEDOUT';

			if (!isNetworkError || attempt === maxRetries) {
				break;
			}

			// Exponential backoff: 1s, 2s, 4s
			const delay = Math.pow(2, attempt - 1) * 1000;
			console.log(`Retrying in ${delay}ms...`);
			await new Promise(resolve => setTimeout(resolve, delay));
		}
	}

	// All retries failed
	console.error('Error updating Clerk user after retries:', lastError);
	if (lastError?.errors) {
		const errorMessages = lastError.errors
			.map((e: any) => e.longMessage || e.message)
			.join(', ');
		throw new Error(`Failed to update Clerk user: ${errorMessages}`);
	}
	throw new Error(
		`Failed to update Clerk user: ${lastError instanceof Error ? lastError.message : String(lastError)}`
	);
}

export async function deleteClerkUser(clerkUserId: string) {
	const client = await clerkClient();
	await client.users.deleteUser(clerkUserId);
}
