import {db} from '../index';
import {isp, ispFiles, ispFileAcknowledgments, residents} from '../schema';
import {eq, and, InferInsertModel, InferSelectModel, isNull, or} from 'drizzle-orm';
import {requireCareAccess, logAudit} from '@/lib/db-helpers';

type IspInsert = InferInsertModel<typeof isp>;
type IspSelect = InferSelectModel<typeof isp>;
type IspUpdate = Partial<IspInsert>;

type IspFileInsert = InferInsertModel<typeof ispFiles>;
type IspFileSelect = InferSelectModel<typeof ispFiles>;

export async function insertIsp(data: IspInsert) {
    const [newIsp] = await db.insert(isp).values(data).returning();
    return newIsp;
}

export async function updateIsp(ispId: string, data: IspUpdate) {
    const [updatedIsp] = await db.update(isp).set(data).where(eq(isp.id, ispId)).returning();
    return updatedIsp;
}

// Mutation: List ISP Files for a resident
// Mutation: List ISP Files for a resident or all for admin
export async function listISPFiles(clerkUserId: string, residentId?: string) {
  const userRole = await requireCareAccess(clerkUserId);

  if (!residentId) {
    if (userRole.role !== 'admin' && userRole.role !== 'supervisor') {
        throw new Error('Access denied: Only admins and supervisors can view all ISP files.');
    }
    // Return all files with resident details
    return await db.query.ispFiles.findMany({
        with: {
            resident: true,
        },
        orderBy: (ispFiles, { desc }) => [desc(ispFiles.uploadedAt)],
        limit: 100, 
    });
  }

  const resident = await db.query.residents.findFirst({
    where: eq(residents.id, residentId),
  });
  if (!resident) throw new Error('Resident not found');

  const userLocations =
    userRole.role === 'admin' ? [] : userRole.locations || [];
  if (
    userRole.role !== 'admin' &&
    !userLocations.includes(resident.location)
  ) {
    throw new Error('Access denied to view ISP files for this resident');
  }

  return await db.query.ispFiles.findMany({
    where: eq(ispFiles.residentId, residentId),
    with: {
        resident: true, // Also include resident here for consistency
    },
    orderBy: (ispFiles, { desc }) => [desc(ispFiles.uploadedAt)],
  });
}

// Mutation: Create ISP File
export async function createISPFile(args: {
  residentId: string;
  versionLabel: string;
  effectiveDate: string; // Date string
  fileStorageId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  preparedBy?: string;
  notes?: string;
  uploadedBy: string;
}) {
  const {
    residentId,
    versionLabel,
    effectiveDate,
    fileStorageId,
    fileName,
    fileSize,
    contentType,
    preparedBy,
    notes,
    uploadedBy,
  } = args;

  // Permissions checked in API route
  // await requireSupervisorAccess(args.uploadedBy);

  const [newISPFile] = await db.insert(ispFiles).values({
    residentId,
    versionLabel,
    effectiveDate: new Date(effectiveDate),
    status: 'draft', // New files start as draft
    fileStorageId,
    fileName,
    fileSize,
    contentType,
    preparedBy,
    notes,
    uploadedBy,
    uploadedAt: new Date(),
  }).returning();

  if (!newISPFile) {
    throw new Error('Failed to create ISP file');
  }

  await logAudit({
    clerkUserId: args.uploadedBy,
    event: 'isp_file.created',
    details: `Created ISP file ${newISPFile.id} for resident ${residentId}, version ${versionLabel}`,
    deviceId: 'system', // Placeholder
    location: '', // Placeholder
  });

  return newISPFile;
}

// Mutation: Activate ISP File
export async function activateISPFile(ispFileId: string, activatedByClerkUserId: string) {
  // Permissions checked in API route
  // await requireSupervisorAccess(activatedByClerkUserId);

  const ispFileToActivate = await db.query.ispFiles.findFirst({
    where: eq(ispFiles.id, ispFileId),
  });

  if (!ispFileToActivate) {
    throw new Error('ISP file not found');
  }

  // Archive any currently active ISP for this resident
  await db.update(ispFiles)
    .set({ status: 'archived', archivedAt: new Date(), archivedBy: activatedByClerkUserId })
    .where(and(
      eq(ispFiles.residentId, ispFileToActivate.residentId),
      eq(ispFiles.status, 'active')
    ));

  // Activate the selected ISP file
  const [activatedISP] = await db.update(ispFiles)
    .set({ status: 'active', activatedAt: new Date(), activatedBy: activatedByClerkUserId })
    .where(eq(ispFiles.id, ispFileId))
    .returning();

  if (!activatedISP) {
    throw new Error('Failed to activate ISP file');
  }

  await logAudit({
    clerkUserId: activatedByClerkUserId,
    event: 'isp_file.activated',
    details: `Activated ISP file ${ispFileId} for resident ${ispFileToActivate.residentId}, version ${ispFileToActivate.versionLabel}`,
    deviceId: 'system', // Placeholder
    location: '', // Placeholder
  });

  return activatedISP;
}

// Mutation: Acknowledge an ISP File (read receipt)
// Idempotent — a repeat acknowledgment is ignored via the unique (file,user) index.
export async function acknowledgeISPFile(clerkUserId: string, ispFileId: string) {
  const file = await db.query.ispFiles.findFirst({
    where: eq(ispFiles.id, ispFileId),
  });

  if (!file) {
    throw new Error('ISP file not found');
  }

  await db
    .insert(ispFileAcknowledgments)
    .values({
      ispFileId,
      residentId: file.residentId,
      clerkUserId,
      acknowledgedAt: new Date(),
    })
    .onConflictDoNothing();

  await logAudit({
    clerkUserId,
    event: 'isp_file.acknowledged',
    details: `Acknowledged ISP file ${ispFileId} for resident ${file.residentId}, version ${file.versionLabel}`,
    deviceId: 'system',
    location: '',
  });

  return {success: true};
}

// Mutation: Delete ISP File
export async function deleteISPFile(ispFileId: string) {
  // Admin access check will be done in the API route
  const ispFileToDelete = await db.query.ispFiles.findFirst({
    where: eq(ispFiles.id, ispFileId),
  });

  if (!ispFileToDelete) {
    throw new Error('ISP file not found');
  }

  await db.delete(ispFiles).where(eq(ispFiles.id, ispFileId));

  await logAudit({
    clerkUserId: '', // Will be filled by API route
    event: 'isp_file.deleted',
    details: `Deleted ISP file ${ispFileId} for resident ${ispFileToDelete.residentId}, version ${ispFileToDelete.versionLabel}`,
    deviceId: 'system', // Placeholder
    location: '', // Placeholder
  });

  return true;
}

// Mutation: Update ISP File Metadata
export async function updateISPFile(ispFileId: string, updates: {
  versionLabel?: string;
  effectiveDate?: string;
  notes?: string;
  preparedBy?: string;
}) {
  // Permissions checked in API route
  const ispFileToUpdate = await db.query.ispFiles.findFirst({
    where: eq(ispFiles.id, ispFileId),
  });

  if (!ispFileToUpdate) {
    throw new Error('ISP file not found');
  }

  const updateData: any = {};
  if (updates.versionLabel) updateData.versionLabel = updates.versionLabel;
  if (updates.effectiveDate) updateData.effectiveDate = new Date(updates.effectiveDate);
  if (updates.notes !== undefined) updateData.notes = updates.notes;
  if (updates.preparedBy !== undefined) updateData.preparedBy = updates.preparedBy;

  if (Object.keys(updateData).length === 0) {
    return ispFileToUpdate;
  }

  const [updatedISP] = await db.update(ispFiles)
    .set(updateData)
    .where(eq(ispFiles.id, ispFileId))
    .returning();

  await logAudit({
    clerkUserId: '', // Handled by API route
    event: 'isp_file.updated',
    details: `Updated ISP file ${ispFileId} metadata`,
    deviceId: 'system',
    location: '',
  });

  return updatedISP;
}
