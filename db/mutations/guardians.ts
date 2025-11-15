import {db} from '../index';
import {guardians, guardianChecklistLinks} from '../schema'; // Assuming guardianChecklistLinks exists for cascade delete
import {eq, InferSelectModel} from 'drizzle-orm';

type GuardianSelect = InferSelectModel<typeof guardians>;
type GuardianInsert = typeof guardians.$inferInsert;

export async function insertGuardian(data: {
    name: string;
    email: string;
    phone: string;
    residentIds: string[];
    createdBy: string;
    relationship?: string;
    address?: string;
}) {
    const [guardian] = await db.insert(guardians).values(data).returning();
    return guardian;
}

export async function updateGuardian(guardianId: string, data: Partial<GuardianSelect>) {
    await db.update(guardians).set(data).where(eq(guardians.id, guardianId));
}

export async function deleteGuardian(guardianId: string) {
    // This will handle cascade deletions (resident relationships, checklist links).
    // The actual implementation will involve deleting from related tables and updating JSONB arrays.

    await db.transaction(async (tx) => {
        // Delete related guardian checklist links
        await tx.delete(guardianChecklistLinks).where(eq(guardianChecklistLinks.guardianEmail, guardianId)); // Assuming guardianEmail is used for linking

        // Note: resident relationships are managed via JSONB arrays in residents table.
        // Deleting a guardian will require updating resident's guardianIds array, which is not a direct cascade delete.

        // Finally, delete the guardian
        await tx.delete(guardians).where(eq(guardians.id, guardianId));
    });
}
