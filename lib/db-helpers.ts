// lib/db-helpers.ts

import {db} from '../db/index';
import {roles, auditLogs} from '../db/schema'; // Import auditLogs schema
import {eq} from 'drizzle-orm';

// Helper: Get user role doc (Drizzle version)
export async function getUserRoleDoc(clerkUserId: string) {
	return await db.query.roles.findFirst({
		where: eq(roles.clerkUserId, clerkUserId),
	});
}

// Helper: Audit (for mutations only)
export async function logAudit(args: {
	clerkUserId: string | null;
	event: string;
	deviceId: string;
	location: string;
	details?: string;
}) {
	await db.insert(auditLogs).values({
		clerkUserId: args.clerkUserId,
		event: args.event,
		timestamp: new Date(),
		deviceId: args.deviceId,
		location: args.location,
		details: args.details,
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

// Helper: Check supervisor access
export async function requireSupervisorAccess(clerkUserId: string) {
	const userRole = await getUserRoleDoc(clerkUserId);
	if (!userRole || !['admin', 'supervisor'].includes(userRole.role || '')) {
		await logAudit({
			clerkUserId: clerkUserId,
			event: 'access_denied',
			details: 'supervisor_access_required',
			deviceId: 'system',
			location: '',
		});
		throw new Error('Supervisor access required');
	}
	return userRole;
}

// Helper: Check admin access
export async function requireAdminAccess(clerkUserId: string) {
	const userRole = await getUserRoleDoc(clerkUserId);
	if (!userRole || userRole.role !== 'admin') {
		await logAudit({
			clerkUserId: clerkUserId,
			event: 'access_denied',
			details: 'admin_access_required',
			deviceId: 'system',
			location: '',
		});
		throw new Error('Admin access required');
	}
	return userRole;
}
