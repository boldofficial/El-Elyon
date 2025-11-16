import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {db} from '@/db/index'; // Corrected import path
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
import {eq, notInArray, isNull, and, or} from 'drizzle-orm'; // Added 'or' for better filtering
import {InferSelectModel} from 'drizzle-orm'; // For explicit typing

interface OrphanedRecord {
	id: string;
	reason: string;
	[key: string]: any;
}

interface ScanResults {
	totalOrphaned: number;
	summary: Record<string, number>;
	orphanedData: Record<string, OrphanedRecord[]>;
}

export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}
		await requireAdminAccess(userId);

		const results: ScanResults = {
			totalOrphaned: 0,
			summary: {},
			orphanedData: {},
		};

		// Fetch all existing IDs for reference
		const existingEmployeeIds = (
			await db.query.employees.findMany()
		).map((e: InferSelectModel<typeof employees>) => e.clerkUserId);
		const existingUserIds = (await db.query.users.findMany()).map(
			(u: InferSelectModel<typeof users>) => u.clerkUserId
		);
		const existingResidentIds = (await db.query.residents.findMany()).map(
			(r: InferSelectModel<typeof residents>) => r.id
		);
		const existingGuardianIds = (await db.query.guardians.findMany()).map(
			(g: InferSelectModel<typeof guardians>) => g.id
		);
		const existingKioskIds = (await db.query.kiosks.findMany()).map(
			(k: InferSelectModel<typeof kiosks>) => k.id
		);
		const existingIspFileIds = (await db.query.ispFiles.findMany()).map(
			(f: InferSelectModel<typeof ispFiles>) => f.id
		);
		const existingIspIds = (await db.query.isp.findMany()).map(
			(i: InferSelectModel<typeof isp>) => i.id
		); // Added existingIspIds

		// --- Scan for Orphaned Roles ---
		const orphanedRoles = await db.query.roles.findMany({
			where: or(
				isNull(roles.clerkUserId),
				existingEmployeeIds.length > 0
					? notInArray(roles.clerkUserId, existingEmployeeIds)
					: undefined
			),
		});
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

		// --- Scan for Orphaned Shifts ---
		const orphanedShifts = await db.query.shifts.findMany({
			where: or(
				isNull(shifts.clerkUserId),
				existingEmployeeIds.length > 0
					? notInArray(shifts.clerkUserId, existingEmployeeIds)
					: undefined
			),
		});
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

		// --- Scan for Orphaned Resident Logs ---
		const orphanedResidentLogs = await db.query.residentLogs.findMany({
			where: or(
				isNull(residentLogs.residentId),
				existingResidentIds.length > 0
					? notInArray(residentLogs.residentId, existingResidentIds)
					: undefined
			),
		});
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

		// --- Scan for Orphaned Audit Logs (by clerkUserId) ---
		const orphanedAuditLogsByClerk = await db.query.auditLogs.findMany({
			where: or(
				isNull(auditLogs.clerkUserId),
				existingUserIds.length > 0
					? notInArray(auditLogs.clerkUserId, existingUserIds)
					: undefined
			),
		});
		if (orphanedAuditLogsByClerk.length > 0) {
			results.summary.auditLogs = orphanedAuditLogsByClerk.length;
			results.orphanedData.auditLogs = orphanedAuditLogsByClerk.map(
				(l: InferSelectModel<typeof auditLogs>) => ({
					id: l.id,
					clerkUserId: l.clerkUserId,
					event: l.event,
					reason: 'No corresponding user record',
				})
			);
			results.totalOrphaned += orphanedAuditLogsByClerk.length;
		}

		// --- Scan for Orphaned ISP Files ---
		const orphanedIspFiles = await db.query.ispFiles.findMany({
			where: or(
				isNull(ispFiles.residentId),
				existingResidentIds.length > 0
					? notInArray(ispFiles.residentId, existingResidentIds)
					: undefined
			),
		});
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

		// --- Scan for Orphaned ISP Access Logs ---
		const orphanedIspAccessLogs = await db.query.ispAccessLogs.findMany({
			where: or(
				isNull(ispAccessLogs.ispFileId),
				existingIspFileIds.length > 0
					? notInArray(ispAccessLogs.ispFileId, existingIspFileIds)
					: undefined
			),
		});
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

		// --- Scan for Orphaned ISP Acknowledgments ---
		const orphanedIspAcknowledgments = await db.query.ispAcknowledgments.findMany({
			where: or(
				isNull(ispAcknowledgments.ispId),
				existingIspIds.length > 0
					? notInArray(ispAcknowledgments.ispId, existingIspIds)
					: undefined
			),
		});
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

		// --- Scan for Orphaned Compliance Alerts (by dismissedBy) ---
		const orphanedComplianceAlerts = await db.query.complianceAlerts.findMany({
			where: or(
				isNull(complianceAlerts.dismissedBy),
				existingUserIds.length > 0
					? notInArray(complianceAlerts.dismissedBy, existingUserIds)
					: undefined
			),
		});
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

		// --- Scan for Orphaned Guardian Checklist Links ---
		const orphanedGuardianChecklistLinks = await db.query.guardianChecklistLinks.findMany({
			where: or(
				isNull(guardianChecklistLinks.residentId),
				existingResidentIds.length > 0
					? notInArray(guardianChecklistLinks.residentId, existingResidentIds)
					: undefined
			),
		});
		if (orphanedGuardianChecklistLinks.length > 0) {
			results.summary.guardianChecklistLinks = orphanedGuardianChecklistLinks.length;
			results.orphanedData.guardianChecklistLinks = orphanedGuardianChecklistLinks.map(
				(l: InferSelectModel<typeof guardianChecklistLinks>) => ({
					id: l.id,
					residentId: l.residentId,
					reason: 'No corresponding resident record',
				})
			);
			results.totalOrphaned += orphanedGuardianChecklistLinks.length;
		}

		// --- Scan for Orphaned Guardians (with orphaned resident refs) ---
		const allGuardians = await db.query.guardians.findMany();
		const orphanedGuardians: OrphanedRecord[] = [];
		for (const guardian of allGuardians) {
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
		if (orphanedGuardians.length > 0) {
			results.summary.guardians = orphanedGuardians.length;
			results.orphanedData.guardians = orphanedGuardians;
			results.totalOrphaned += orphanedGuardians.length;
		}

		// --- Scan for Orphaned Kiosks (by createdBy or registeredBy) ---
		const orphanedKiosks = await db.query.kiosks.findMany({
			where: or(
				isNull(kiosks.createdBy),
				existingUserIds.length > 0
					? notInArray(kiosks.createdBy, existingUserIds)
					: undefined
			),
		});
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

		return NextResponse.json(results);
	} catch (error: any) {
		console.error('Error scanning for orphaned data:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to scan for orphaned data'},
			{status: 500}
		);
	}
}
