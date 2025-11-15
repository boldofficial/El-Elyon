import {db} from '../index';
import {residents, complianceAlerts, fireEvac, guardianChecklistLinks, isp} from '../schema'; // Removed auditLogs and guardiansToResidents as they don't directly link via residentId for cascade delete
import {eq} from 'drizzle-orm';
import {InferSelectModel} from 'drizzle-orm';

type ResidentSelect = InferSelectModel<typeof residents>;
type ResidentInsert = typeof residents.$inferInsert;

export async function insertResident(data: ResidentInsert) {
    const [resident] = await db.insert(residents).values(data).returning();
    return resident;
}

export async function updateResident(residentId: string, data: Partial<ResidentSelect>) {
    await db.update(residents).set(data).where(eq(residents.id, residentId));
}

export async function deleteResident(residentId: string) {
    // This will be complex and require multiple Drizzle operations for cascade deletions
    // (logs, alerts, ISPs, fire evacs, checklist links, guardian relationships).
    // The actual implementation will involve deleting from related tables.

    await db.transaction(async (tx) => {
        // Note: guardiansToResidents is not a direct table, relationships are managed via JSONB arrays.
        // Deleting a resident will require updating guardian's residentIds array, which is not a direct cascade delete.
        // For now, direct table deletions are handled.

        // Delete related guardian checklist links
        await tx.delete(guardianChecklistLinks).where(eq(guardianChecklistLinks.residentId, residentId));
        // Delete related compliance alerts (requires proper JSONB query for metadata.residentId)
        // await tx.delete(complianceAlerts).where(eq(complianceAlerts.metadata.residentId, residentId)); // This line needs a proper JSONB query
        // Delete related fire evacuation records
        await tx.delete(fireEvac).where(eq(fireEvac.residentId, residentId));
        // Delete related ISP records
        await tx.delete(isp).where(eq(isp.residentId, residentId));
        // Audit logs do not have a direct residentId foreign key for cascade deletion.

        // Finally, delete the resident
        await tx.delete(residents).where(eq(residents.id, residentId));
    });
}
