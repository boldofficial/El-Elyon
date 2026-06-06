import {db} from '@/db/index';
import {
	shifts,
	residentLogs,
	roles,
	employees,
	users,
	ispAccessLogs,
	ispAcknowledgments,
	complianceAlerts,
	residents,
	guardians,
	kiosks,
	auditLogs,
	ispFiles,
	guardianChecklistLinks,
} from '@/db/schema';
import {eq, inArray} from 'drizzle-orm';
import {requireAdminOrPrivilege} from '@/lib/db-helpers';
import {logAudit} from './audit';
import {clerkClient} from '@clerk/nextjs/server';
import {
	fetchExistingIds,
	scanOrphanedRoles,
	scanOrphanedShifts,
	scanOrphanedResidentLogs,
	scanOrphanedAuditLogs,
	scanOrphanedIspFiles,
	scanOrphanedIspAccessLogs,
	scanOrphanedIspAcknowledgments,
	scanOrphanedComplianceAlerts,
	scanOrphanedGuardianChecklistLinks,
	scanOrphanedGuardianResidentRefs,
	scanOrphanedKiosks,
} from '@/db/queries/cleanup';

export interface CleanupResult {
	success: boolean;
	deletedCount: number;
	deletedRecords: Record<string, string[]>;
}

/**
 * Helper: Delete user and all related records
 */
async function deleteUserAndRelatedRecords(clerkUserId: string) {
	// 1. Delete shifts
	await db.delete(shifts).where(eq(shifts.clerkUserId, clerkUserId));

	// 2. Delete resident logs
	await db.delete(residentLogs).where(eq(residentLogs.authorId, clerkUserId));

	// 3. Delete ISP access logs
	await db
		.delete(ispAccessLogs)
		.where(eq(ispAccessLogs.clerkUserId, clerkUserId));

	// 4. Delete role record
	await db.delete(roles).where(eq(roles.clerkUserId, clerkUserId));

	// 5. Delete employee record
	await db.delete(employees).where(eq(employees.clerkUserId, clerkUserId));

	// 6. Delete user record (if exists in our `users` table)
	await db.delete(users).where(eq(users.clerkUserId, clerkUserId));

	// 7. Update related records where clerkUserId is a foreign key
	// For complianceAlerts, set dismissedBy to null
	await db
		.update(complianceAlerts)
		.set({dismissedBy: null})
		.where(eq(complianceAlerts.dismissedBy, clerkUserId));

	// For residents, set createdBy to null
	await db
		.update(residents)
		.set({createdBy: null})
		.where(eq(residents.createdBy, clerkUserId));

	// For guardians, set createdBy to null
	await db
		.update(guardians)
		.set({createdBy: null})
		.where(eq(guardians.createdBy, clerkUserId));

	// For kiosks, set createdBy and registeredBy to null
	await db
		.update(kiosks)
		.set({createdBy: null, registeredBy: null})
		.where(eq(kiosks.createdBy, clerkUserId));

	// 8. Delete audit logs
	await db.delete(auditLogs).where(eq(auditLogs.clerkUserId, clerkUserId));

	// 9. Delete Clerk user account
	try {
		const client = await clerkClient();
		await client.users.deleteUser(clerkUserId);
		console.log(`Successfully deleted Clerk user: ${clerkUserId}`);
	} catch (error) {
		console.error(`Failed to delete Clerk user ${clerkUserId}:`, error);
		// Don't throw, continue with local cleanup
	}
}

/**
 * Clean up orphaned users (users without proper records)
 */
export async function cleanupOrphanedUsers(adminClerkUserId: string) {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const allEmployees = await db.query.employees.findMany();
	const allRoles = await db.query.roles.findMany();
	const allUsers = await db.query.users.findMany();

	// Create sets of clerkUserIds from each table
	const employeeClerkUserIds = new Set(
		allEmployees
			.map((emp) => emp.clerkUserId)
			.filter((id): id is string => id !== null)
	);
	const roleClerkUserIds = new Set(
		allRoles
			.map((role) => role.clerkUserId)
			.filter((id): id is string => id !== null)
	);
	const userClerkUserIds = new Set(
		allUsers
			.map((user) => user.clerkUserId)
			.filter((id): id is string => id !== null)
	);

	const deletedUsers = [];

	// Find all unique clerkUserIds across all tables
	const allClerkUserIds = new Set([
		...employeeClerkUserIds,
		...roleClerkUserIds,
		...userClerkUserIds,
	]);

	// Check each clerkUserId for orphaned records
	for (const id of allClerkUserIds) {
		// Skip the current admin user
		if (id === adminClerkUserId) continue;

		const hasEmployee = employeeClerkUserIds.has(id);
		const hasRole = roleClerkUserIds.has(id);
		const hasUser = userClerkUserIds.has(id);

		// A user is orphaned if they're missing any of the three core records
		const isOrphaned = !hasEmployee || !hasRole || !hasUser;

		if (isOrphaned) {
			const roleDoc = allRoles.find((r) => r.clerkUserId === id);
			await deleteUserAndRelatedRecords(id);
			deletedUsers.push({
				clerkUserId: id,
				role: roleDoc?.role || 'unknown',
				reason: {
					missingEmployee: !hasEmployee,
					missingRole: !hasRole,
					missingUser: !hasUser,
				},
			});
		}
	}

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_users',
		details: `orphanedUsersFound=${deletedUsers.length}`,
		deviceId: 'system',
		location: '',
	});

	return {
		success: true,
		totalEmployees: allEmployees.length,
		totalRoles: allRoles.length,
		totalUsers: allUsers.length,
		orphanedUsersFound: deletedUsers.length,
		deleted: deletedUsers,
	};
}

/**
 * Delete orphaned roles
 */
export async function cleanupOrphanedRoles(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedRoles = await scanOrphanedRoles(existingIds.employeeIds);

	if (orphanedRoles.length === 0) {
		return {success: true, deletedCount: 0, deletedRecords: {roles: []}};
	}

	const idsToDelete = orphanedRoles.map((r) => r.id);
	await db.delete(roles).where(inArray(roles.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_roles',
		details: `Deleted ${orphanedRoles.length} orphaned roles`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedRoles.length,
		deletedRecords: {roles: idsToDelete},
	};
}

/**
 * Delete orphaned shifts
 */
export async function cleanupOrphanedShifts(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedShifts = await scanOrphanedShifts(existingIds.employeeIds);

	if (orphanedShifts.length === 0) {
		return {success: true, deletedCount: 0, deletedRecords: {shifts: []}};
	}

	const idsToDelete = orphanedShifts.map((s) => s.id);
	await db.delete(shifts).where(inArray(shifts.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_shifts',
		details: `Deleted ${orphanedShifts.length} orphaned shifts`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedShifts.length,
		deletedRecords: {shifts: idsToDelete},
	};
}

/**
 * Delete orphaned resident logs
 */
export async function cleanupOrphanedResidentLogs(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedLogs = await scanOrphanedResidentLogs(existingIds.residentIds);

	if (orphanedLogs.length === 0) {
		return {success: true, deletedCount: 0, deletedRecords: {residentLogs: []}};
	}

	const idsToDelete = orphanedLogs.map((l) => l.id);
	await db.delete(residentLogs).where(inArray(residentLogs.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_resident_logs',
		details: `Deleted ${orphanedLogs.length} orphaned resident logs`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedLogs.length,
		deletedRecords: {residentLogs: idsToDelete},
	};
}

/**
 * Delete orphaned audit logs
 */
export async function cleanupOrphanedAuditLogs(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedLogs = await scanOrphanedAuditLogs(existingIds.userIds);

	if (orphanedLogs.length === 0) {
		return {success: true, deletedCount: 0, deletedRecords: {auditLogs: []}};
	}

	const idsToDelete = orphanedLogs.map((l) => l.id);
	await db.delete(auditLogs).where(inArray(auditLogs.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_audit_logs',
		details: `Deleted ${orphanedLogs.length} orphaned audit logs`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedLogs.length,
		deletedRecords: {auditLogs: idsToDelete},
	};
}

/**
 * Delete orphaned ISP files
 */
export async function cleanupOrphanedIspFiles(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedFiles = await scanOrphanedIspFiles(existingIds.residentIds);

	if (orphanedFiles.length === 0) {
		return {success: true, deletedCount: 0, deletedRecords: {ispFiles: []}};
	}

	const idsToDelete = orphanedFiles.map((f) => f.id);
	await db.delete(ispFiles).where(inArray(ispFiles.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_isp_files',
		details: `Deleted ${orphanedFiles.length} orphaned ISP files`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedFiles.length,
		deletedRecords: {ispFiles: idsToDelete},
	};
}

/**
 * Delete orphaned ISP access logs
 */
export async function cleanupOrphanedIspAccessLogs(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedLogs = await scanOrphanedIspAccessLogs(existingIds.ispFileIds);

	if (orphanedLogs.length === 0) {
		return {
			success: true,
			deletedCount: 0,
			deletedRecords: {ispAccessLogs: []},
		};
	}

	const idsToDelete = orphanedLogs.map((l) => l.id);
	await db.delete(ispAccessLogs).where(inArray(ispAccessLogs.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_isp_access_logs',
		details: `Deleted ${orphanedLogs.length} orphaned ISP access logs`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedLogs.length,
		deletedRecords: {ispAccessLogs: idsToDelete},
	};
}

/**
 * Delete orphaned ISP acknowledgments
 */
export async function cleanupOrphanedIspAcknowledgments(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedAcks = await scanOrphanedIspAcknowledgments(existingIds.ispIds);

	if (orphanedAcks.length === 0) {
		return {
			success: true,
			deletedCount: 0,
			deletedRecords: {ispAcknowledgments: []},
		};
	}

	const idsToDelete = orphanedAcks.map((a) => a.id);
	await db
		.delete(ispAcknowledgments)
		.where(inArray(ispAcknowledgments.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_isp_acknowledgments',
		details: `Deleted ${orphanedAcks.length} orphaned ISP acknowledgments`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedAcks.length,
		deletedRecords: {ispAcknowledgments: idsToDelete},
	};
}

/**
 * Delete orphaned compliance alerts
 */
export async function cleanupOrphanedComplianceAlerts(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedAlerts = await scanOrphanedComplianceAlerts(
		existingIds.userIds
	);

	if (orphanedAlerts.length === 0) {
		return {
			success: true,
			deletedCount: 0,
			deletedRecords: {complianceAlerts: []},
		};
	}

	const idsToDelete = orphanedAlerts.map((a) => a.id);
	await db
		.delete(complianceAlerts)
		.where(inArray(complianceAlerts.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_compliance_alerts',
		details: `Deleted ${orphanedAlerts.length} orphaned compliance alerts`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedAlerts.length,
		deletedRecords: {complianceAlerts: idsToDelete},
	};
}

/**
 * Delete orphaned guardian checklist links
 */
export async function cleanupOrphanedGuardianChecklistLinks(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedLinks = await scanOrphanedGuardianChecklistLinks(
		existingIds.residentIds
	);

	if (orphanedLinks.length === 0) {
		return {
			success: true,
			deletedCount: 0,
			deletedRecords: {guardianChecklistLinks: []},
		};
	}

	const idsToDelete = orphanedLinks.map((l) => l.id);
	await db
		.delete(guardianChecklistLinks)
		.where(inArray(guardianChecklistLinks.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_guardian_checklist_links',
		details: `Deleted ${orphanedLinks.length} orphaned guardian checklist links`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedLinks.length,
		deletedRecords: {guardianChecklistLinks: idsToDelete},
	};
}

/**
 * Clean up guardian resident references (removes invalid resident IDs from guardians)
 */
export async function cleanupOrphanedGuardianResidentRefs(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedGuardians = await scanOrphanedGuardianResidentRefs(
		existingIds.residentIds
	);

	if (orphanedGuardians.length === 0) {
		return {success: true, deletedCount: 0, deletedRecords: {guardians: []}};
	}

	const updatedGuardianIds: string[] = [];

	const allGuardians = await db.query.guardians.findMany();

	for (const guardian of allGuardians) {
		if (!guardian.residentIds) continue;

		const cleanedResidentIds = guardian.residentIds.filter((resId: string) =>
			existingIds.residentIds.includes(resId)
		);

		if (cleanedResidentIds.length !== guardian.residentIds.length) {
			await db
				.update(guardians)
				.set({residentIds: cleanedResidentIds})
				.where(eq(guardians.id, guardian.id));
			updatedGuardianIds.push(guardian.id);
		}
	}

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_guardian_resident_refs',
		details: `Updated ${updatedGuardianIds.length} guardians to remove orphaned resident references`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: updatedGuardianIds.length,
		deletedRecords: {guardians: updatedGuardianIds},
	};
}

/**
 * Delete orphaned kiosks
 */
export async function cleanupOrphanedKiosks(
	adminClerkUserId: string
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	const existingIds = await fetchExistingIds();
	const orphanedKiosks = await scanOrphanedKiosks(existingIds.userIds);

	if (orphanedKiosks.length === 0) {
		return {success: true, deletedCount: 0, deletedRecords: {kiosks: []}};
	}

	const idsToDelete = orphanedKiosks.map((k) => k.id);
	await db.delete(kiosks).where(inArray(kiosks.id, idsToDelete));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'cleanup_orphaned_kiosks',
		details: `Deleted ${orphanedKiosks.length} orphaned kiosks`,
		deviceId: 'system',
		location: 'system',
	});

	return {
		success: true,
		deletedCount: orphanedKiosks.length,
		deletedRecords: {kiosks: idsToDelete},
	};
}

/**
 * Clean up specific categories of orphaned data
 */
export async function cleanupOrphanedDataByCategories(
	adminClerkUserId: string,
	categories: string[]
): Promise<CleanupResult> {
	await requireAdminOrPrivilege(adminClerkUserId, 'manage_data_cleanup');

	let totalDeleted = 0;
	const allDeletedRecords: Record<string, string[]> = {};

	for (const category of categories) {
		let result: CleanupResult;

		switch (category) {
			case 'roles':
				result = await cleanupOrphanedRoles(adminClerkUserId);
				break;
			case 'shifts':
				result = await cleanupOrphanedShifts(adminClerkUserId);
				break;
			case 'residentLogs':
				result = await cleanupOrphanedResidentLogs(adminClerkUserId);
				break;
			case 'auditLogs':
				result = await cleanupOrphanedAuditLogs(adminClerkUserId);
				break;
			case 'ispFiles':
				result = await cleanupOrphanedIspFiles(adminClerkUserId);
				break;
			case 'ispAccessLogs':
				result = await cleanupOrphanedIspAccessLogs(adminClerkUserId);
				break;
			case 'ispAcknowledgments':
				result = await cleanupOrphanedIspAcknowledgments(adminClerkUserId);
				break;
			case 'complianceAlerts':
				result = await cleanupOrphanedComplianceAlerts(adminClerkUserId);
				break;
			case 'guardianChecklistLinks':
				result = await cleanupOrphanedGuardianChecklistLinks(adminClerkUserId);
				break;
			case 'guardians':
				result = await cleanupOrphanedGuardianResidentRefs(adminClerkUserId);
				break;
			case 'kiosks':
				result = await cleanupOrphanedKiosks(adminClerkUserId);
				break;
			default:
				console.warn(`Unknown cleanup category: ${category}`);
				continue;
		}

		totalDeleted += result.deletedCount;
		Object.assign(allDeletedRecords, result.deletedRecords);
	}

	return {
		success: true,
		deletedCount: totalDeleted,
		deletedRecords: allDeletedRecords,
	};
}
