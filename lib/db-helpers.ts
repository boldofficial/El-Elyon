// lib/db-helpers.ts

import {db} from '../db/index';
import {roles, auditLogs} from '../db/schema'; // Import auditLogs schema
import {eq} from 'drizzle-orm';

// Helper: Get user role doc (Drizzle version)
export async function getUserRoleDoc(clerkUserId: string) {
	const roleDoc = await db.query.roles.findFirst({
		where: eq(roles.clerkUserId, clerkUserId),
	});
	
	if (roleDoc) {
		const { employees } = await import('../db/schema');
		const employeeDoc = await db.query.employees.findFirst({
			where: eq(employees.clerkUserId, clerkUserId),
		});
		
		roleDoc.locations = Array.from(new Set([
			...(roleDoc.locations || []),
			...(employeeDoc?.locations || [])
		]));
		roleDoc.role = roleDoc.role?.toLowerCase() || roleDoc.role;
	}
	
	return roleDoc;
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
	const role = userRole?.role?.toLowerCase() || '';
	
	if (
		!userRole ||
		!role ||
		!['admin', 'supervisor', 'staff'].includes(role)
	) {
		await logAudit({
			clerkUserId: clerkUserId,
			event: 'access_denied',
			details: `care_access_required_actual_${role}`,
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
	const role = userRole?.role?.toLowerCase() || '';
	
	if (!userRole || !['admin', 'supervisor'].includes(role)) {
		await logAudit({
			clerkUserId: clerkUserId,
			event: 'access_denied',
			details: `supervisor_access_required_actual_${role}`,
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
	const role = userRole?.role?.toLowerCase() || '';

	if (!userRole || role !== 'admin') {
		await logAudit({
			clerkUserId: clerkUserId,
			event: 'access_denied',
			details: `admin_access_required_actual_${role}`,
			deviceId: 'system',
			location: '',
		});
		throw new Error('Admin access required');
	}
	return userRole;
}

export async function requireAdminOrSupervisorAccess(clerkUserId: string) {
	const userRole = await getUserRoleDoc(clerkUserId);
	const role = userRole?.role?.toLowerCase() || '';

	if (!userRole || !['admin', 'supervisor'].includes(role)) {
		await logAudit({
			clerkUserId: clerkUserId,
			event: 'access_denied',
			details: `admin_or_supervisor_access_required_actual_${role}`,
			deviceId: 'system',
			location: '',
		});
		throw new Error('Admin or Supervisor access required');
	}
	return userRole;
}
