import { db } from '../index';
import { fireEvac, residents } from '../schema';
import { eq, desc } from 'drizzle-orm';
import { requireCareAccess, requireSupervisorAccess, logAudit } from '@/lib/db-helpers';

// Mutation: List Fire Evac Plans for a resident
export async function listFireEvacPlans(clerkUserId: string, residentId: string) {
  const userRole = await requireCareAccess(clerkUserId);

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
    throw new Error('Access denied to view Fire Evac plans for this resident');
  }

  const plans = await db.query.fireEvac.findMany({
    where: eq(fireEvac.residentId, residentId),
    orderBy: [desc(fireEvac.version)],
  });

  return plans;
}

// Mutation: Create Fire Evac Plan
export async function createFireEvacPlan(args: {
  residentId: string;
  fileStorageId: string;
  fileName: string;
  fileSize: number;
  contentType: string;
  mobilityNeeds?: string;
  assistanceRequired?: string;
  medicalEquipment?: string;
  specialInstructions?: string;
  notes?: string;
  uploadedBy: string;
}) {
  const {
    residentId,
    fileStorageId,
    fileName,
    fileSize,
    contentType,
    mobilityNeeds,
    assistanceRequired,
    medicalEquipment,
    specialInstructions,
    notes,
    uploadedBy,
  } = args;

  await requireSupervisorAccess(uploadedBy); // Ensure supervisor/admin access

  // Get current resident's location for the plan record
  const resident = await db.query.residents.findFirst({
    where: eq(residents.id, residentId),
  });
  
  if (!resident) throw new Error('Resident not found');

  // Determine next version number
  const existingPlans = await db.query.fireEvac.findMany({
    where: eq(fireEvac.residentId, residentId),
    orderBy: [desc(fireEvac.version)],
    limit: 1,
  });
  
  const nextVersion = existingPlans.length > 0 ? existingPlans[0].version + 1 : 1;

  const [newPlan] = await db.insert(fireEvac).values({
    residentId,
    location: resident.location,
    version: nextVersion,
    mobilityNeeds,
    assistanceRequired,
    medicalEquipment,
    specialInstructions,
    fileStorageId,
    fileName,
    fileSize,
    contentType,
    notes,
    createdBy: uploadedBy,
    createdAt: new Date(),
  }).returning();

  if (!newPlan) {
    throw new Error('Failed to create Fire Evac plan');
  }

  await logAudit({
    clerkUserId: uploadedBy,
    event: 'fire_evac.created',
    details: `Created Fire Evac plan ${newPlan.id} for resident ${residentId}, version ${nextVersion}`,
    deviceId: 'system',
    location: resident.location,
  });

  return newPlan;
}
