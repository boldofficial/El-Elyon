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

export async function deleteGuardian(guardianId: string) {
	await db.transaction(async (tx) => {
		const guardian = await tx.query.guardians.findFirst({
			where: eq(guardians.id, guardianId),
		});

		if (!guardian) {
			throw new Error('Guardian not found');
		}

		// Delete all guardian_checklist_links for this guardian (by email)
		await tx
			.delete(guardianChecklistLinks)
			.where(eq(guardianChecklistLinks.guardianEmail, guardian.email));

		// Remove guardianId from all residents' guardianIds arrays
		if (guardian.residentIds && guardian.residentIds.length > 0) {
			for (const residentId of guardian.residentIds) {
				const resident = await tx.query.residents.findFirst({
					where: eq(residents.id, residentId),
				});

				if (resident && resident.guardianIds) {
					const newGuardianIds = resident.guardianIds.filter(
						(id: string) => id !== guardianId
					);

					await tx
						.update(residents)
						.set({guardianIds: newGuardianIds})
						.where(eq(residents.id, residentId));
				}
			}
		}

		// Finally, delete the guardian
		await tx.delete(guardians).where(eq(guardians.id, guardianId));
	});
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
