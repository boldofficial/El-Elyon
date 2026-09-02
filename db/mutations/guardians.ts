// src/db/mutations/guardians.ts
import {db} from '../index';
import {guardians, residents, guardianChecklistLinks} from '../schema';
import {eq, sql} from 'drizzle-orm';
import {InferSelectModel} from 'drizzle-orm';
import {requireCareAccess, requireAdminAccess} from '@/lib/db-helpers';
import {logAudit} from './audit';

type GuardianSelect = InferSelectModel<typeof guardians>;
type GuardianInsert = typeof guardians.$inferInsert;

export async function insertGuardian(data: GuardianInsert) {
	const [guardian] = await db.insert(guardians).values(data).returning();
	return guardian;
}

export async function updateGuardian(
	guardianId: string,
	data: Partial<GuardianSelect>
) {
	const [updated] = await db
		.update(guardians)
		.set(data)
		.where(eq(guardians.id, guardianId))
		.returning();

	return updated;
}

/**
 * Deletes a guardian and detaches them from the residents they were linked to.
 *
 * Neither link is a foreign key, so neither cascades:
 *   1. guardian_checklist_links joins on guardian_email, not guardian_id. The
 *      email is resolved with a subquery so we do not need to read the guardian
 *      first - this statement has to run before the guardian row is deleted.
 *   2. residents.guardian_ids is a JSONB array, cleared with the JSONB minus
 *      operator so concurrent deletions cannot overwrite each other (a
 *      read-modify-write loop in TypeScript loses updates at READ COMMITTED).
 *
 * db.batch() sends all three statements in one request, which Neon runs as a
 * single atomic transaction. See the note in db/index.ts on why
 * db.transaction() is unavailable on this driver.
 */
export async function deleteGuardian(guardianId: string) {
	const [, , deleted] = await db.batch([
		// 1. Remove checklist links belonging to this guardian's email.
		db
			.delete(guardianChecklistLinks)
			.where(
				sql`${guardianChecklistLinks.guardianEmail} = (
					select ${guardians.email} from ${guardians}
					where ${guardians.id} = ${guardianId}
				)`
			),

		// 2. Detach the guardian from every resident that references them.
		db
			.update(residents)
			.set({
				guardianIds: sql`${residents.guardianIds} - ${guardianId}::text`,
			})
			.where(
				sql`${residents.guardianIds} @> ${JSON.stringify([guardianId])}::jsonb`
			),

		// 3. Delete the guardian itself.
		db
			.delete(guardians)
			.where(eq(guardians.id, guardianId))
			.returning({id: guardians.id}),
	]);

	if (deleted.length === 0) {
		throw new Error('Guardian not found');
	}

	return deleted[0];
}

// High-level mutation with auth checks
export async function createGuardianWithAuth(
	clerkUserId: string,
	data: {
		name: string;
		email: string;
		phone: string;
		residentIds: string[];
		relationship?: string;
		address?: string;
	}
) {
	await requireCareAccess(clerkUserId);

	const guardian = await insertGuardian({
		...data,
		createdBy: clerkUserId,
		createdAt: new Date(),
	});

	await logAudit({
		clerkUserId,
		event: 'create_guardian',
		details: `guardianId=${guardian.id}, residentCount=${data.residentIds.length}`,
		deviceId: 'system',
		location: '',
	});

	return guardian;
}

export async function updateGuardianWithAuth(
	clerkUserId: string,
	guardianId: string,
	data: {
		name: string;
		email: string;
		phone: string;
		relationship?: string;
		address?: string;
		residentIds: string[];
	}
) {
	await requireCareAccess(clerkUserId);

	const updated = await updateGuardian(guardianId, data);

	await logAudit({
		clerkUserId,
		event: 'update_guardian',
		details: `guardianId=${guardianId}`,
		deviceId: 'system',
		location: '',
	});

	return updated;
}

export async function deleteGuardianWithAuth(
	clerkUserId: string,
	guardianId: string
) {
	await requireAdminAccess(clerkUserId);

	await deleteGuardian(guardianId);

	await logAudit({
		clerkUserId,
		event: 'delete_guardian',
		details: `guardianId=${guardianId}`,
		deviceId: 'system',
		location: '',
	});

	return {success: true};
}
