// src/db/mutations/residents.ts
import {db} from '../index';
import {
	residents,
	guardians,
	complianceAlerts,
	guardianChecklistLinks,
} from '../schema';
import {and, eq, gt, sql} from 'drizzle-orm';
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
 * Retires every open notice pointing at a resident who has left the facility.
 *
 * Deliberately narrow: this deactivates reminders, it deletes nothing. The
 * resident row, their logs, ISPs, drill reports and documents all stay exactly
 * where they are -- a departed resident is a record to keep, not a record to
 * remove. Only the outbound noise stops.
 *
 * Two tables need explicit handling here, for the same reasons deleteResident
 * has to handle them: neither is reachable by a cascade.
 *
 *   1. compliance_alerts points at the resident inside a JSONB metadata blob
 *      rather than through a foreign key, so `metadata ->> 'residentId'` is
 *      the only way to find their alerts. Location/type alerts (smoke
 *      detector, scheduled fire drill) carry no residentId and are left alone
 *      -- the house still needs those even after one resident moves out.
 *
 *   2. guardian_checklist_links does have a foreign key, but revoking a link
 *      is an update, not a delete: an unexpired link is still emailable and
 *      still submittable by the guardian. Pulling expiresAt back to now closes
 *      both doors while leaving the row (and any completed responses) intact.
 *
 * Why this runs at flip time rather than waiting for the nightly sweep: the
 * compliance cron would eventually stop regenerating these on its own, since
 * its generators now skip inactive residents and clearStale retires whatever
 * they no longer produce. But "eventually" is up to 24 hours. A family that
 * has just lost someone should not receive one more overnight reminder.
 *
 * Idempotent -- re-running it simply matches nothing.
 */
export async function retireResidentNotices(residentId: string) {
	const now = new Date();

	const [alerts, links] = await db.batch([
		db
			.update(complianceAlerts)
			.set({
				active: false,
				status: 'resolved',
				dismissedAt: now,
				dismissedBy: 'system:resident_inactive',
			})
			.where(
				and(
					eq(complianceAlerts.active, true),
					sql`(${complianceAlerts.metadata} ->> 'residentId')::text = ${residentId}`
				)
			)
			.returning({id: complianceAlerts.id}),

		db
			.update(guardianChecklistLinks)
			.set({expiresAt: now})
			.where(
				and(
					eq(guardianChecklistLinks.residentId, residentId),
					eq(guardianChecklistLinks.completed, false),
					gt(guardianChecklistLinks.expiresAt, now)
				)
			)
			.returning({id: guardianChecklistLinks.id}),
	]);

	return {
		alertsDeactivated: alerts.length,
		checklistLinksRevoked: links.length,
	};
}

/**
 * The counterpart to retireResidentNotices: a resident marked inactive is
 * being made active again.
 *
 * Per the facility: residents do not come back. A placement that ends, ends.
 * So this path is NOT a returning resident -- it is a data-entry correction.
 * Someone ticked the wrong row, or picked the wrong reason, and is undoing it.
 *
 * That assumption decides the one question this function exists to answer:
 *
 *   `residents.placementDate` anchors the admission fire drill -- a 3-day
 *   deadline, evaluated in lib/life-safety-reporting.ts. If this were a real
 *   return it would be arguable that a new admission restarts that clock. It
 *   is not a real return, so the original placement date is still the correct
 *   one and moving it would invent a drill deadline for a resident who never
 *   actually left. placementDate is therefore deliberately untouched.
 *
 * If that assumption ever changes -- respite stays, hospital returns, anything
 * where a resident genuinely re-enters the house -- this is the function to
 * revisit, and `placementDate` is the field in question.
 *
 * What happens on its own, with no help from here:
 *   - The daily compliance cron re-includes the resident in every generator,
 *     so ISP and fire-evac reminders come back within 24 hours.
 *
 * What does NOT come back, on purpose:
 *   - Revoked guardian checklist links stay expired. Their original expiry was
 *     overwritten when they were revoked, so there is nothing to restore to;
 *     a supervisor sends a fresh link if one is still wanted. Cheap to redo,
 *     and far better than resurrecting a link with a guessed expiry date.
 *
 * The real product of this function is the audit trail its caller writes.
 * Since residents never return, every reactivation is by definition an
 * anomaly -- most importantly the reversal of a `deceased` marking, which is
 * something an inspector would want to see recorded rather than silently
 * absorbed. Hence the reason for the original deactivation is echoed back.
 *
 * @param residentId       The resident being reactivated.
 * @param inactiveReason   Why they were marked inactive, read BEFORE the
 *                         update cleared it. Null if none was recorded.
 * @returns                A note for the audit log.
 */
export async function reinstateResidentNotices(
	residentId: string,
	inactiveReason: string | null
): Promise<{note: string}> {
	// Nothing to write. Residents do not return, so this is a correction of the
	// original tick, and a correction should leave the placement record exactly
	// as it was. The function stays as the documented home of that reasoning --
	// and as the seam to change if the assumption ever stops holding.
	void residentId;

	return {
		note: inactiveReason
			? `treated as a correction of an earlier "${inactiveReason}" marking; placement record unchanged`
			: 'treated as a correction of an earlier inactive marking; placement record unchanged',
	};
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
