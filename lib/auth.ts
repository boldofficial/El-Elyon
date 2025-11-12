import {auth} from '@clerk/nextjs/server';
import {getFullUserData} from '@/db/queries/users';

export async function getCurrentUser() {
	const {userId} = await auth();

	if (!userId) {
		return null;
	}

	const userData = await getFullUserData(userId);
	return userData;
}

export async function requireAuth() {
	const user = await getCurrentUser();

	if (!user) {
		throw new Error('Unauthorized');
	}

	return user;
}

export async function requireRole(allowedRoles: string[]) {
	const user = await requireAuth();

	if (!user.role || !allowedRoles.includes(user.role)) {
		throw new Error('Forbidden: Insufficient permissions');
	}

	return user;
}
