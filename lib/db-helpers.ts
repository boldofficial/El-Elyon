import {db} from '../db/index';
import {roles} from '../db/schema';
import {eq} from 'drizzle-orm';
import {logAudit} from '@/db/mutations/audit';

// Helper: Get user role doc (Drizzle version)
export async function getUserRoleDoc(clerkUserId: string) {
	return await db.query.roles.findFirst({
		where: eq(roles.clerkUserId, clerkUserId),
	});
}

// Helper: Check if user has care access
export async function requireCareAccess(clerkUserId: string) {
	const userRole = await getUserRoleDoc(clerkUserId);
	if (
		!userRole ||
		!userRole.role ||
		!['admin', 'supervisor', 'staff'].includes(userRole.role)
	) {
		await logAudit({
			clerkUserId: clerkUserId,
			event: 'access_denied',
			details: 'care_access_required',
			deviceId: 'system',
			location: '',
		});
		throw new Error('Care access required');
	}
	return userRole;
}
