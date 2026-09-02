// src/db/mutations/residents.ts
import {db} from '../index';
import {
	residents,
	guardians,
	complianceAlerts,
	guardianChecklistLinks,
} from '../schema';
import {eq, sql} from 'drizzle-orm';
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
 * Deletes a resident and everything that belongs to them.
 *
 * Most child rows are removed by the database itself: resident_logs,
 * incident_reports, isp, isp_files, isp_access_logs, isp_acknowledgments,
 * fire_evac, guardian_checklist_links, resident_documents and
 * resident_log_activities all declare ON DELETE CASCADE on residents.id
 * (see drizzle/0000_initial_database_schema.sql). Deleting them by hand here
 * duplicated that logic and was the only reason this needed a transaction.
 *
 * Two things are NOT covered by a foreign key, because neither is one:
 *   1. compliance_alerts references the resident inside a JSONB metadata blob.
 *   2. guardians.resident_ids is a JSONB array of ids.
 *
 * Both are handled below, then the resident row is deleted and the cascade
 * does the rest. All three statements go out in a single db.batch(), which
 * Neon runs as one atomic transaction.
 *
 * The guardians update uses the JSONB minus operator rather than
 * read-modify-write in TypeScript. That matters: reading every guardian,
 * filtering the array in JS and writing it back loses concurrent updates at
 * READ COMMITTED - two simultaneous deletions could each reinstate the other's
 * removed id. `resident_ids - $1` has no such window.
 */
export async function deleteResident(residentId: string) {
	const [, , deleted] = await db.batch([
		// 1. Compliance alerts point at the resident via metadata JSONB, not an FK.
		db
			.delete(complianceAlerts)
			.where(
				sql`(${complianceAlerts.metadata} ->> 'residentId')::text = ${residentId}`
			),

		// 2. Remove the id from every guardian's resident_ids array, atomically.
		db
			.update(guardians)
			.set({
				residentIds: sql`${guardians.residentIds} - ${residentId}::text`,
			})
			.where(
				sql`${guardians.residentIds} @> ${JSON.stringify([residentId])}::jsonb`
			),

		// 3. Delete the resident; ON DELETE CASCADE clears the child tables.
		db
			.delete(residents)
			.where(eq(residents.id, residentId))
			.returning({id: residents.id}),
	]);

	if (deleted.length === 0) {
		throw new Error('Resident not found');
	}

	return deleted[0];
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
