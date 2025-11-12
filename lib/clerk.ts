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
	const username = args.email.split('@')[0].toLowerCase();

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

export async function deleteClerkUser(clerkUserId: string) {
	const client = await clerkClient();
	await client.users.deleteUser(clerkUserId);
}
