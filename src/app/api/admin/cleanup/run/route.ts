import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess} from '@/lib/db-helpers';
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
	isp, // Added isp import
} from '@/db/schema';
import {eq, notInArray, isNull, and, or, inArray} from 'drizzle-orm';
import {logAudit} from '@/lib/db-helpers';
import {InferSelectModel} from 'drizzle-orm';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}
		await requireAdminAccess(userId);

		const {categories} = await req.json();

		if (!Array.isArray(categories)) {
			return NextResponse.json(
				{error: 'Invalid input: categories must be an array'},
				{status: 400}
			);
		}

		let deletedCount = 0;
		const deletedRecords: Record<string, string[]> = {};

		// Fetch all existing IDs for reference (same as scan route)
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
		);

		for (const category of categories) {
			deletedRecords[category] = [];
			let categoryDeletedCount = 0;

			switch (category) {
				case 'roles':
					const orphanedRoles = await db.query.roles.findMany({
						where: or(
							isNull(roles.clerkUserId),
							existingEmployeeIds.length > 0
								? notInArray(roles.clerkUserId, existingEmployeeIds as string[])
								: undefined
						),
					});
					if (orphanedRoles.length > 0) {
						const idsToDelete = orphanedRoles.map((r) => r.id);
						await db.delete(roles).where(inArray(roles.id, idsToDelete));
						categoryDeletedCount = orphanedRoles.length;
						deletedRecords.roles.push(...idsToDelete);
					}
					break;
				case 'shifts':
					const orphanedShifts = await db.query.shifts.findMany({
						where: or(
							isNull(shifts.clerkUserId),
							existingEmployeeIds.length > 0
								? notInArray(shifts.clerkUserId, existingEmployeeIds as string[])
								: undefined
						),
					});
					if (orphanedShifts.length > 0) {
						const idsToDelete = orphanedShifts.map((s) => s.id);
						await db.delete(shifts).where(inArray(shifts.id, idsToDelete));
						categoryDeletedCount = orphanedShifts.length;
						deletedRecords.shifts.push(...idsToDelete);
					}
					break;
				case 'residentLogs':
					const orphanedResidentLogs = await db.query.residentLogs.findMany({
						where: or(
							isNull(residentLogs.residentId),
							existingResidentIds.length > 0
								? notInArray(residentLogs.residentId, existingResidentIds)
								: undefined
						),
					});
					if (orphanedResidentLogs.length > 0) {
						const idsToDelete = orphanedResidentLogs.map((l) => l.id);
						await db
							.delete(residentLogs)
							.where(inArray(residentLogs.id, idsToDelete));
						categoryDeletedCount = orphanedResidentLogs.length;
						deletedRecords.residentLogs.push(...idsToDelete);
					}
					break;
				case 'auditLogs':
					const orphanedAuditLogs = await db.query.auditLogs.findMany({
						where: or(
							isNull(auditLogs.clerkUserId),
							existingUserIds.length > 0
								? notInArray(auditLogs.clerkUserId, existingUserIds as string[])
								: undefined
						),
					});
					if (orphanedAuditLogs.length > 0) {
						const idsToDelete = orphanedAuditLogs.map((l) => l.id);
						await db
							.delete(auditLogs)
							.where(inArray(auditLogs.id, idsToDelete));
						categoryDeletedCount = orphanedAuditLogs.length;
						deletedRecords.auditLogs.push(...idsToDelete);
					}
					break;
				case 'ispFiles':
					const orphanedIspFiles = await db.query.ispFiles.findMany({
						where: or(
							isNull(ispFiles.residentId),
							existingResidentIds.length > 0
								? notInArray(ispFiles.residentId, existingResidentIds)
								: undefined
						),
					});
					if (orphanedIspFiles.length > 0) {
						const idsToDelete = orphanedIspFiles.map((f) => f.id);
						await db.delete(ispFiles).where(inArray(ispFiles.id, idsToDelete));
						categoryDeletedCount = orphanedIspFiles.length;
						deletedRecords.ispFiles.push(...idsToDelete);
					}
					break;
				case 'ispAccessLogs':
					const orphanedIspAccessLogs = await db.query.ispAccessLogs.findMany({
						where: or(
							isNull(ispAccessLogs.ispFileId),
							existingIspFileIds.length > 0
								? notInArray(ispAccessLogs.ispFileId, existingIspFileIds)
								: undefined
						),
					});
					if (orphanedIspAccessLogs.length > 0) {
						const idsToDelete = orphanedIspAccessLogs.map((l) => l.id);
						await db
							.delete(ispAccessLogs)
							.where(inArray(ispAccessLogs.id, idsToDelete));
						categoryDeletedCount = orphanedIspAccessLogs.length;
						deletedRecords.ispAccessLogs.push(...idsToDelete);
					}
					break;
				case 'ispAcknowledgments':
					const orphanedIspAcknowledgments = await db.query.ispAcknowledgments.findMany({
						where: or(
							isNull(ispAcknowledgments.ispId),
							existingIspIds.length > 0
								? notInArray(ispAcknowledgments.ispId, existingIspIds)
								: undefined
						),
					});
					if (orphanedIspAcknowledgments.length > 0) {
						const idsToDelete = orphanedIspAcknowledgments.map((a) => a.id);
						await db
							.delete(ispAcknowledgments)
							.where(inArray(ispAcknowledgments.id, idsToDelete));
						categoryDeletedCount = orphanedIspAcknowledgments.length;
						deletedRecords.ispAcknowledgments.push(...idsToDelete);
					}
					break;
				case 'complianceAlerts':
					const orphanedComplianceAlerts = await db.query.complianceAlerts.findMany({
						where: or(
							isNull(complianceAlerts.dismissedBy),
							existingUserIds.length > 0
								? notInArray(complianceAlerts.dismissedBy, existingUserIds as string[])
								: undefined
						),
					});
					if (orphanedComplianceAlerts.length > 0) {
						const idsToDelete = orphanedComplianceAlerts.map((a) => a.id);
						await db
							.delete(complianceAlerts)
							.where(inArray(complianceAlerts.id, idsToDelete));
						categoryDeletedCount = orphanedComplianceAlerts.length;
						deletedRecords.complianceAlerts.push(...idsToDelete);
					}
					break;
				case 'guardianChecklistLinks':
					const orphanedGuardianChecklistLinks = await db.query.guardianChecklistLinks.findMany({
						where: or(
							isNull(guardianChecklistLinks.residentId),
							existingResidentIds.length > 0
								? notInArray(guardianChecklistLinks.residentId, existingResidentIds)
								: undefined
						),
					});
					if (orphanedGuardianChecklistLinks.length > 0) {
						const idsToDelete = orphanedGuardianChecklistLinks.map((l) => l.id);
						await db
							.delete(guardianChecklistLinks)
							.where(inArray(guardianChecklistLinks.id, idsToDelete));
						categoryDeletedCount = orphanedGuardianChecklistLinks.length;
						deletedRecords.guardianChecklistLinks.push(...idsToDelete);
					}
					break;
				case 'guardians':
					// For guardians, we only clean up orphaned resident references within the guardian's residentIds array
					const allGuardians = await db.query.guardians.findMany();
					for (const guardian of allGuardians) {
						const originalResidentIds = guardian.residentIds;
						if (!originalResidentIds) continue; // Handle null case for residentIds

						const cleanedResidentIds = originalResidentIds.filter(
							(resId: string) => existingResidentIds.includes(resId)
						);

						if (cleanedResidentIds.length !== originalResidentIds.length) {
							await db
								.update(guardians)
								.set({residentIds: cleanedResidentIds})
								.where(eq(guardians.id, guardian.id));
							categoryDeletedCount++; // Count as one update
							deletedRecords.guardians.push(guardian.id);
						}
					}
					break;
				case 'kiosks':
					const orphanedKiosks = await db.query.kiosks.findMany({
						where: or(
							isNull(kiosks.createdBy),
							existingUserIds.length > 0
								? notInArray(kiosks.createdBy, existingUserIds as string[])
								: undefined
						),
					});
					if (orphanedKiosks.length > 0) {
						const idsToDelete = orphanedKiosks.map((k) => k.id);
						await db.delete(kiosks).where(inArray(kiosks.id, idsToDelete));
						categoryDeletedCount = orphanedKiosks.length;
						deletedRecords.kiosks.push(...idsToDelete);
					}
					break;
				default:
					console.warn(`Unknown cleanup category: ${category}`);
					break;
			}
			deletedCount += categoryDeletedCount;
		}

		await logAudit({
			clerkUserId: userId,
			event: 'data_cleanup_run',
			details: `Cleaned up ${deletedCount} records across categories: ${categories.join(
				', '
			)}`,
			deviceId: 'server',
			location: 'server',
		});

		return NextResponse.json({success: true, deletedCount, deletedRecords});
	} catch (error: any) {
		console.error('Error running data cleanup:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to run data cleanup'},
			{status: 500}
		);
	}
}
