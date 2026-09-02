// lib/db-helpers.ts

import {db} from '../db/index';
import {roles, auditLogs} from '../db/schema'; // Import auditLogs schema
import {eq} from 'drizzle-orm';
import {type AdminPrivilege} from '@/lib/admin-privileges';
import {hasAdminPrivilege} from '@/db/queries/admin-privileges';

/**
 * Typed authorization failure raised by every `require*Access` helper below.
 *
 * Route handlers must map authorization to 403 with `instanceof AccessDeniedError`
 * rather than substring-matching a human-readable message. A heuristic such as
 * `error.message.includes('access')` also matches unrelated internal failures
 * ("cannot access database connection"), which silently reports a real outage as
 * an authorization result instead of a 500.
 *
 * It extends `Error` and keeps the historical message text, so pre-existing
 * consumers that only check `instanceof Error` or match on the message continue
 * to behave exactly as before.
 */
export class AccessDeniedError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AccessDeniedError';
	}
}

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
		throw new AccessDeniedError('Care access required');
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
		throw new AccessDeniedError('Supervisor access required');
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
		throw new AccessDeniedError('Admin access required');
	}
	return userRole;
}

export async function requireAdminOrPrivilege(
	clerkUserId: string,
	privilege: AdminPrivilege
) {
	const userRole = await getUserRoleDoc(clerkUserId);
	const role = userRole?.role?.toLowerCase() || '';

	if (role === 'admin' || (await hasAdminPrivilege(clerkUserId, privilege))) {
		return userRole;
	}

	await logAudit({
		clerkUserId,
		event: 'access_denied',
		details: `admin_or_privilege_required_${privilege}_actual_${role}`,
		deviceId: 'system',
		location: '',
	});
	throw new AccessDeniedError('Admin privilege required');
}

export async function requireAdminOrAnyPrivilege(
	clerkUserId: string,
	privileges: AdminPrivilege[]
) {
	const userRole = await getUserRoleDoc(clerkUserId);
	const role = userRole?.role?.toLowerCase() || '';

	if (role === 'admin') return userRole;

	for (const privilege of privileges) {
		if (await hasAdminPrivilege(clerkUserId, privilege)) {
			return userRole;
		}
	}

	await logAudit({
		clerkUserId,
		event: 'access_denied',
		details: `admin_or_any_privilege_required_${privileges.join('|')}_actual_${role}`,
		deviceId: 'system',
		location: '',
	});
	throw new AccessDeniedError('Admin privilege required');
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
		throw new AccessDeniedError('Admin or Supervisor access required');
	}
	return userRole;
}
