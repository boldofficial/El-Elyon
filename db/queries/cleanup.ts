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
	isp,
} from '@/db/schema';
import {notInArray, isNull, or} from 'drizzle-orm';
import {InferSelectModel} from 'drizzle-orm';
import {ExistingIds, OrphanedRecord, ScanResults} from '../types';

/**
 * Fetches all existing IDs from core tables for reference checking
 */
export async function fetchExistingIds(): Promise<ExistingIds> {
	const [
		employeesData,
		usersData,
		residentsData,
		guardiansData,
		kiosksData,
		ispFilesData,
		ispData,
	] = await Promise.all([
		db.query.employees.findMany(),
		db.query.users.findMany(),
		db.query.residents.findMany(),
		db.query.guardians.findMany(),
		db.query.kiosks.findMany(),
		db.query.ispFiles.findMany(),
		db.query.isp.findMany(),
	]);

	return {
		employeeIds: employeesData.map((e) => e.clerkUserId),
		userIds: usersData.map((u) => u.clerkUserId),
		residentIds: residentsData.map((r) => r.id),
		guardianIds: guardiansData.map((g) => g.id),
		kioskIds: kiosksData.map((k) => k.id),
		ispFileIds: ispFilesData.map((f) => f.id),
		ispIds: ispData.map((i) => i.id),
	};
}

/**
 * Scans for orphaned roles that reference non-existent employees
 */
export async function scanOrphanedRoles(
	existingEmployeeIds: (string | null)[]
) {
	return await db.query.roles.findMany({
		where: or(
			isNull(roles.clerkUserId),
			existingEmployeeIds.length > 0
				? notInArray(roles.clerkUserId, existingEmployeeIds as string[])
				: undefined
		),
	});
}

/**
 * Scans for orphaned shifts that reference non-existent employees
 */
export async function scanOrphanedShifts(
	existingEmployeeIds: (string | null)[]
) {
	return await db.query.shifts.findMany({
		where: or(
			isNull(shifts.clerkUserId),
			existingEmployeeIds.length > 0
				? notInArray(shifts.clerkUserId, existingEmployeeIds as string[])
				: undefined
		),
	});
}

/**
 * Scans for orphaned resident logs that reference non-existent residents
 */
export async function scanOrphanedResidentLogs(existingResidentIds: string[]) {
	return await db.query.residentLogs.findMany({
		where: or(
			isNull(residentLogs.residentId),
			existingResidentIds.length > 0
				? notInArray(residentLogs.residentId, existingResidentIds)
				: undefined
		),
	});
}

/**
 * Scans for orphaned audit logs that reference non-existent users
 */
export async function scanOrphanedAuditLogs(existingUserIds: string[]) {
	return await db.query.auditLogs.findMany({
		where: or(
			isNull(auditLogs.clerkUserId),
			existingUserIds.length > 0
				? notInArray(auditLogs.clerkUserId, existingUserIds)
				: undefined
		),
	});
}

/**
 * Scans for orphaned ISP files that reference non-existent residents
 */
export async function scanOrphanedIspFiles(existingResidentIds: string[]) {
	return await db.query.ispFiles.findMany({
		where: or(
			isNull(ispFiles.residentId),
			existingResidentIds.length > 0
				? notInArray(ispFiles.residentId, existingResidentIds)
				: undefined
		),
	});
}

/**
 * Scans for orphaned ISP access logs that reference non-existent ISP files
 */
export async function scanOrphanedIspAccessLogs(existingIspFileIds: string[]) {
	return await db.query.ispAccessLogs.findMany({
		where: or(
			isNull(ispAccessLogs.ispFileId),
			existingIspFileIds.length > 0
				? notInArray(ispAccessLogs.ispFileId, existingIspFileIds)
				: undefined
		),
	});
}

/**
 * Scans for orphaned ISP acknowledgments that reference non-existent ISPs
 */
export async function scanOrphanedIspAcknowledgments(existingIspIds: string[]) {
	return await db.query.ispAcknowledgments.findMany({
		where: or(
			isNull(ispAcknowledgments.ispId),
			existingIspIds.length > 0
				? notInArray(ispAcknowledgments.ispId, existingIspIds)
				: undefined
		),
	});
}

/**
 * Scans for orphaned compliance alerts that reference non-existent users
 */
export async function scanOrphanedComplianceAlerts(existingUserIds: string[]) {
	return await db.query.complianceAlerts.findMany({
		where: or(
			isNull(complianceAlerts.dismissedBy),
			existingUserIds.length > 0
				? notInArray(complianceAlerts.dismissedBy, existingUserIds)
				: undefined
		),
	});
}

/**
 * Scans for orphaned guardian checklist links that reference non-existent residents
 */
export async function scanOrphanedGuardianChecklistLinks(
	existingResidentIds: string[]
) {
	return await db.query.guardianChecklistLinks.findMany({
		where: or(
			isNull(guardianChecklistLinks.residentId),
			existingResidentIds.length > 0
				? notInArray(guardianChecklistLinks.residentId, existingResidentIds)
				: undefined
		),
	});
}

/**
 * Scans for guardians with orphaned resident references
 */
export async function scanOrphanedGuardianResidentRefs(
	existingResidentIds: string[]
) {
	const allGuardians = await db.query.guardians.findMany();
	const orphanedGuardians: OrphanedRecord[] = [];

	for (const guardian of allGuardians) {
		if (!guardian.residentIds) continue;

		const orphanedResidentRefs = guardian.residentIds.filter(
			(resId: string) => !existingResidentIds.includes(resId)
		);

		if (orphanedResidentRefs.length > 0) {
			orphanedGuardians.push({
				id: guardian.id,
				name: guardian.name,
				orphanedResidentIds: orphanedResidentRefs,
				reason: 'References non-existent resident(s)',
			});
		}
	}

	return orphanedGuardians;
}

/**
 * Scans for orphaned kiosks that reference non-existent users
 */
export async function scanOrphanedKiosks(existingUserIds: string[]) {
	return await db.query.kiosks.findMany({
		where: or(
			isNull(kiosks.createdBy),
			existingUserIds.length > 0
				? notInArray(kiosks.createdBy, existingUserIds)
				: undefined
		),
	});
}

/**
 * Main function to scan for all orphaned data across the database
 */
export async function scanAllOrphanedData(): Promise<ScanResults> {
	const results: ScanResults = {
		totalOrphaned: 0,
		summary: {},
		orphanedData: {},
	};

	// Fetch all existing IDs
	const existingIds = await fetchExistingIds();

	// Scan for orphaned records in parallel
	const [
		orphanedRoles,
		orphanedShifts,
		orphanedResidentLogs,
		orphanedAuditLogs,
		orphanedIspFiles,
		orphanedIspAccessLogs,
		orphanedIspAcknowledgments,
		orphanedComplianceAlerts,
		orphanedGuardianChecklistLinks,
		orphanedGuardians,
		orphanedKiosks,
	] = await Promise.all([
		scanOrphanedRoles(existingIds.employeeIds),
		scanOrphanedShifts(existingIds.employeeIds),
		scanOrphanedResidentLogs(existingIds.residentIds),
		scanOrphanedAuditLogs(existingIds.userIds),
		scanOrphanedIspFiles(existingIds.residentIds),
		scanOrphanedIspAccessLogs(existingIds.ispFileIds),
		scanOrphanedIspAcknowledgments(existingIds.ispIds),
		scanOrphanedComplianceAlerts(existingIds.userIds),
		scanOrphanedGuardianChecklistLinks(existingIds.residentIds),
		scanOrphanedGuardianResidentRefs(existingIds.residentIds),
		scanOrphanedKiosks(existingIds.userIds),
	]);

	// Process roles
	if (orphanedRoles.length > 0) {
		results.summary.roles = orphanedRoles.length;
		results.orphanedData.roles = orphanedRoles.map(
			(r: InferSelectModel<typeof roles>) => ({
				id: r.id,
				clerkUserId: r.clerkUserId,
				role: r.role,
				reason: 'No corresponding employee record',
			})
		);
		results.totalOrphaned += orphanedRoles.length;
	}

	// Process shifts
	if (orphanedShifts.length > 0) {
		results.summary.shifts = orphanedShifts.length;
		results.orphanedData.shifts = orphanedShifts.map(
			(s: InferSelectModel<typeof shifts>) => ({
				id: s.id,
				clerkUserId: s.clerkUserId,
				location: s.location,
				reason: 'No corresponding employee record',
			})
		);
		results.totalOrphaned += orphanedShifts.length;
	}

	// Process resident logs
	if (orphanedResidentLogs.length > 0) {
		results.summary.residentLogs = orphanedResidentLogs.length;
		results.orphanedData.residentLogs = orphanedResidentLogs.map(
			(l: InferSelectModel<typeof residentLogs>) => ({
				id: l.id,
				residentId: l.residentId,
				template: l.template,
				reason: 'No corresponding resident record',
			})
		);
		results.totalOrphaned += orphanedResidentLogs.length;
	}

	// Process audit logs
	if (orphanedAuditLogs.length > 0) {
		results.summary.auditLogs = orphanedAuditLogs.length;
		results.orphanedData.auditLogs = orphanedAuditLogs.map(
			(l: InferSelectModel<typeof auditLogs>) => ({
				id: l.id,
				clerkUserId: l.clerkUserId,
				event: l.event,
				reason: 'No corresponding user record',
			})
		);
		results.totalOrphaned += orphanedAuditLogs.length;
	}

	// Process ISP files
	if (orphanedIspFiles.length > 0) {
		results.summary.ispFiles = orphanedIspFiles.length;
		results.orphanedData.ispFiles = orphanedIspFiles.map(
			(f: InferSelectModel<typeof ispFiles>) => ({
				id: f.id,
				residentId: f.residentId,
				fileName: f.fileName,
				reason: 'No corresponding resident record',
			})
		);
		results.totalOrphaned += orphanedIspFiles.length;
	}

	// Process ISP access logs
	if (orphanedIspAccessLogs.length > 0) {
		results.summary.ispAccessLogs = orphanedIspAccessLogs.length;
		results.orphanedData.ispAccessLogs = orphanedIspAccessLogs.map(
			(l: InferSelectModel<typeof ispAccessLogs>) => ({
				id: l.id,
				ispFileId: l.ispFileId,
				reason: 'No corresponding ISP File record',
			})
		);
		results.totalOrphaned += orphanedIspAccessLogs.length;
	}

	// Process ISP acknowledgments
	if (orphanedIspAcknowledgments.length > 0) {
		results.summary.ispAcknowledgments = orphanedIspAcknowledgments.length;
		results.orphanedData.ispAcknowledgments = orphanedIspAcknowledgments.map(
			(a: InferSelectModel<typeof ispAcknowledgments>) => ({
				id: a.id,
				ispId: a.ispId,
				reason: 'No corresponding ISP record',
			})
		);
		results.totalOrphaned += orphanedIspAcknowledgments.length;
	}

	// Process compliance alerts
	if (orphanedComplianceAlerts.length > 0) {
		results.summary.complianceAlerts = orphanedComplianceAlerts.length;
		results.orphanedData.complianceAlerts = orphanedComplianceAlerts.map(
			(a: InferSelectModel<typeof complianceAlerts>) => ({
				id: a.id,
				dismissedBy: a.dismissedBy,
				reason: 'No corresponding user record for dismissedBy',
			})
		);
		results.totalOrphaned += orphanedComplianceAlerts.length;
	}

	// Process guardian checklist links
	if (orphanedGuardianChecklistLinks.length > 0) {
		results.summary.guardianChecklistLinks =
			orphanedGuardianChecklistLinks.length;
		results.orphanedData.guardianChecklistLinks =
			orphanedGuardianChecklistLinks.map(
				(l: InferSelectModel<typeof guardianChecklistLinks>) => ({
					id: l.id,
					residentId: l.residentId,
					reason: 'No corresponding resident record',
				})
			);
		results.totalOrphaned += orphanedGuardianChecklistLinks.length;
	}

	// Process guardians
	if (orphanedGuardians.length > 0) {
		results.summary.guardians = orphanedGuardians.length;
		results.orphanedData.guardians = orphanedGuardians;
		results.totalOrphaned += orphanedGuardians.length;
	}

	// Process kiosks
	if (orphanedKiosks.length > 0) {
		results.summary.kiosks = orphanedKiosks.length;
		results.orphanedData.kiosks = orphanedKiosks.map(
			(k: InferSelectModel<typeof kiosks>) => ({
				id: k.id,
				name: k.name,
				createdBy: k.createdBy,
				registeredBy: k.registeredBy,
				reason: 'No corresponding user record for createdBy or registeredBy',
			})
		);
		results.totalOrphaned += orphanedKiosks.length;
	}

	return results;
}
