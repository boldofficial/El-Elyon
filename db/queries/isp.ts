import {db} from '../index';
import {isp, ispFiles, ispFileAcknowledgments} from '../schema';
import {eq, and, inArray} from 'drizzle-orm';
import {getUserRoleDoc} from '@/lib/db-helpers';
import {isActiveResident} from '@/lib/resident-status';

export async function getIspById(ispId: string) {
    return await db.query.isp.findFirst({
        where: eq(isp.id, ispId),
    });
}

export async function listIspsByResidentId(residentId: string) {
    return await db.query.isp.findMany({
        where: eq(isp.residentId, residentId),
        orderBy: (isp, {desc}) => [desc(isp.createdAt)], // Order by createdAt descending
    });
}

export async function listPublishedIspsByResidentId(residentId: string) {
    return await db.query.isp.findMany({
        where: and(eq(isp.residentId, residentId), eq(isp.published, true)),
        orderBy: (isp, {desc}) => [desc(isp.createdAt)],
    });
}

export interface PendingISPFileAck {
    ispFileId: string;
    residentId: string;
    residentName: string;
    location: string | null;
    versionLabel: string;
    effectiveDate: Date;
    fileName: string;
    fileStorageId: string;
    contentType: string;
}

// Active ISP files the given user still needs to acknowledge, scoped to the
// user's assigned locations (admins see all). When a new file is activated the
// prior version is archived, so only the current active version is ever pending.
//
// Residents who have left the facility are skipped. ispFiles.status stays
// 'active' after a resident becomes inactive -- the two columns are unrelated,
// and the file is still the current version of a document that must be kept --
// so without this check staff keep being asked to acknowledge the care plan of
// someone no longer in the house.
export async function getPendingISPFileAcknowledgments(
    clerkUserId: string
): Promise<PendingISPFileAck[]> {
    const userRole = await getUserRoleDoc(clerkUserId);
    if (!userRole) return [];

    const role = userRole.role?.toLowerCase();
    const userLocations = userRole.locations || [];

    const activeFiles = await db.query.ispFiles.findMany({
        where: eq(ispFiles.status, 'active'),
        with: {resident: true},
    });

    const placed = activeFiles.filter(
        (f) => f.resident && isActiveResident(f.resident)
    );

    const scoped =
        role === 'admin'
            ? placed
            : placed.filter((f) => userLocations.includes(f.resident!.location));

    if (scoped.length === 0) return [];

    const acks = await db.query.ispFileAcknowledgments.findMany({
        where: and(
            eq(ispFileAcknowledgments.clerkUserId, clerkUserId),
            inArray(
                ispFileAcknowledgments.ispFileId,
                scoped.map((f) => f.id)
            )
        ),
    });
    const ackedIds = new Set(acks.map((a) => a.ispFileId));

    return scoped
        .filter((f) => !ackedIds.has(f.id))
        .map((f) => ({
            ispFileId: f.id,
            residentId: f.residentId,
            residentName: f.resident?.name || 'Unknown Resident',
            location: f.resident?.location ?? null,
            versionLabel: f.versionLabel,
            effectiveDate: f.effectiveDate,
            fileName: f.fileName,
            fileStorageId: f.fileStorageId,
            contentType: f.contentType,
        }));
}
