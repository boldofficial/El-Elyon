import {and, eq, isNull, inArray} from 'drizzle-orm';
import {db} from '@/db/index';
import {adminPrivileges, employees, roles} from '@/db/schema';
import {
	type AdminPrivilege,
	ADMIN_PRIVILEGES,
	normalizeAdminPrivileges,
} from '@/lib/admin-privileges';

export async function getActiveAdminPrivileges(
	clerkUserId: string
): Promise<AdminPrivilege[]> {
	const grants = await db.query.adminPrivileges.findMany({
		where: and(
			eq(adminPrivileges.clerkUserId, clerkUserId),
			isNull(adminPrivileges.revokedAt)
		),
	});

	return normalizeAdminPrivileges(grants.map((grant) => grant.privilege));
}

export async function hasAdminPrivilege(
	clerkUserId: string,
	privilege: AdminPrivilege
) {
	const grant = await db.query.adminPrivileges.findFirst({
		where: and(
			eq(adminPrivileges.clerkUserId, clerkUserId),
			eq(adminPrivileges.privilege, privilege),
			isNull(adminPrivileges.revokedAt)
		),
	});

	return Boolean(grant);
}

export async function listDelegatableUsersWithPrivileges() {
	const employeeRows = await db
		.select({
			id: employees.id,
			clerkUserId: employees.clerkUserId,
			name: employees.name,
			email: employees.email,
			workEmail: employees.workEmail,
			role: roles.role,
			locations: employees.locations,
			employmentStatus: employees.employmentStatus,
		})
		.from(employees)
		.leftJoin(roles, eq(employees.clerkUserId, roles.clerkUserId))
		.where(inArray(roles.role, ['staff', 'supervisor']));

	const activeGrants = await db.query.adminPrivileges.findMany({
		where: isNull(adminPrivileges.revokedAt),
	});

	return employeeRows
		.filter((employee) => employee.clerkUserId)
		.map((employee) => ({
			...employee,
			privileges: normalizeAdminPrivileges(
				activeGrants
					.filter((grant) => grant.clerkUserId === employee.clerkUserId)
					.map((grant) => grant.privilege)
			),
		}));
}

export function getAllAdminPrivileges() {
	return [...ADMIN_PRIVILEGES];
}
