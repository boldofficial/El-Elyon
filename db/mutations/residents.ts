// src/db/mutations/residents.ts
import {db} from '../index';
import {
	residents,
	guardians,
	complianceAlerts,
	fireEvac,
	guardianChecklistLinks,
	isp,
	ispFiles,
	ispAccessLogs,
	ispAcknowledgments,
	residentLogs,
	incidentReports,
} from '../schema';
import {eq, sql, inArray} from 'drizzle-orm';
import {InferSelectModel} from 'drizzle-orm';
import {requireCareAccess, requireAdminAccess} from '@/lib/db-helpers';
import {logAudit} from './audit';

type ResidentSelect = InferSelectModel<typeof residents>;
type ResidentInsert = typeof residents.$inferInsert;

export async function insertResident(data: ResidentInsert) {
	const [resident] = await db.insert(residents).values(data).returning();
	return resident;
}

export async function updateResident(
	residentId: string,
	data: Partial<ResidentSelect>
) {
	const [updated] = await db
		.update(residents)
		.set(data)
		.where(eq(residents.id, residentId))
		.returning();

	return updated;
}

/**
 * Complete cascade delete for resident
 * This removes all related records across the system
 */
export async function deleteResident(residentId: string) {
	await db.transaction(async (tx) => {
		const resident = await tx.query.residents.findFirst({
			where: eq(residents.id, residentId),
		});

		if (!resident) {
			throw new Error('Resident not found');
		}

		// 1. Delete all resident_logs
		await tx
			.delete(residentLogs)
			.where(eq(residentLogs.residentId, residentId));

		// 2. Delete all incident_reports
		await tx
			.delete(incidentReports)
			.where(eq(incidentReports.residentId, residentId));

		// 3. Delete all audit_logs related to this resident
		// Note: We can't directly cascade audit_logs, but we can filter by details
		// This is optional - you may want to keep audit logs for compliance

		// 4. Delete all compliance_alerts by checking metadata.residentId
		await tx
			.delete(complianceAlerts)
			.where(
				sql`(${complianceAlerts.metadata} ->> 'residentId')::text = ${residentId}`
			);

		// 5. Delete all isp_acknowledgments
		await tx
			.delete(ispAcknowledgments)
			.where(eq(ispAcknowledgments.residentId, residentId));

		// 6. Delete all isp_access_logs
		await tx
			.delete(ispAccessLogs)
			.where(eq(ispAccessLogs.residentId, residentId));

		// 7. Delete all isp_files
		await tx.delete(ispFiles).where(eq(ispFiles.residentId, residentId));

		// 8. Delete all isp records
		await tx.delete(isp).where(eq(isp.residentId, residentId));

		// 9. Delete all fire_evac plans
		await tx.delete(fireEvac).where(eq(fireEvac.residentId, residentId));

		// 10. Delete all guardian_checklist_links
		await tx
			.delete(guardianChecklistLinks)
			.where(eq(guardianChecklistLinks.residentId, residentId));

		// 11. Remove residentId from all guardians' residentIds arrays
		const allGuardians = await tx.query.guardians.findMany();

		for (const guardian of allGuardians) {
			if (guardian.residentIds && guardian.residentIds.includes(residentId)) {
				const newResidentIds = guardian.residentIds.filter(
					(id: string) => id !== residentId
				);

				await tx
					.update(guardians)
					.set({residentIds: newResidentIds})
					.where(eq(guardians.id, guardian.id));
			}
		}

		// 12. Finally, delete the resident
		await tx.delete(residents).where(eq(residents.id, residentId));
	});
}

// High-level mutations with auth checks
export async function createResidentWithAuth(
	clerkUserId: string,
	data: {
		name: string;
		location: string;
		dateOfBirth: string;
		guardians?: Array<{
			name: string;
			email: string;
			phone: string;
			preferredChannel: string;
		}>;
		generateChecklist?: boolean;
	}
) {
	await requireCareAccess(clerkUserId);

	const resident = await insertResident({
		name: data.name,
		location: data.location,
		dateOfBirth: data.dateOfBirth,
		createdBy: clerkUserId,
		createdAt: new Date(),
	});

	await logAudit({
		clerkUserId,
		event: 'create_resident',
		details: `residentId=${resident.id}, location=${data.location}`,
		deviceId: 'system',
		location: '',
	});

	// Create guardians if provided
	const createdGuardianIds: string[] = [];

	if (data.guardians && data.guardians.length > 0) {
		for (const guardianData of data.guardians) {
			if (
				guardianData.name.trim() &&
				guardianData.email.trim() &&
				guardianData.phone.trim()
			) {
				const [guardian] = await db
					.insert(guardians)
					.values({
						name: guardianData.name.trim(),
						email: guardianData.email.trim(),
						phone: guardianData.phone.trim(),
						residentIds: [resident.id],
						createdBy: clerkUserId,
						createdAt: new Date(),
					})
					.returning();

				createdGuardianIds.push(guardian.id);

				await logAudit({
					clerkUserId,
					event: 'create_guardian',
					details: `guardianId=${guardian.id}`,
					deviceId: 'system',
					location: '',
				});
			}
		}
	}

	// Generate checklist if requested
	if (data.generateChecklist && createdGuardianIds.length > 0) {
		// Get the default active template
		const templates = await db.query.guardianChecklistTemplates.findMany();
		const defaultTemplate = templates.find((t) => t.active) || templates[0];

		if (defaultTemplate) {
			for (const guardianId of createdGuardianIds) {
				const guardian = await db.query.guardians.findFirst({
					where: eq(guardians.id, guardianId),
				});

				if (guardian && guardian.email) {
					const token =
						Math.random().toString(36).slice(2) + Date.now().toString(36);
					const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

					const [link] = await db
						.insert(guardianChecklistLinks)
						.values({
							residentId: resident.id,
							templateId: defaultTemplate.id,
							guardianEmail: guardian.email,
							token,
							sentDate: new Date(),
							expiresAt,
							completed: false,
						})
						.returning();

					// Trigger email sending
					await fetch(
						`${process.env.NEXT_PUBLIC_SITE_URL}/api/internal/compliance/send-guardian-checklist-email`,
						{
							method: 'POST',
							headers: {'Content-Type': 'application/json'},
							body: JSON.stringify({linkId: link.id, token}),
						}
					);
				}
			}
		}
	}

	return resident;
}

export async function updateResidentWithAuth(
	clerkUserId: string,
	residentId: string,
	data: Partial<ResidentSelect>
) {
	await requireCareAccess(clerkUserId);

	const updated = await updateResident(residentId, data);

	await logAudit({
		clerkUserId,
		event: 'update_resident',
		details: `residentId=${residentId}`,
		deviceId: 'system',
		location: '',
	});

	return updated;
}

export async function deleteResidentWithAuth(
	clerkUserId: string,
	residentId: string
) {
	await requireAdminAccess(clerkUserId);

	await deleteResident(residentId);

	await logAudit({
		clerkUserId,
		event: 'delete_resident',
		details: `residentId=${residentId}`,
		deviceId: 'system',
		location: '',
	});

	return {success: true};
}
