import {db} from '../index';
import {residents, residentLogs, config, shifts, isp, ispAcknowledgments} from '../schema';
import {eq, and, isNull} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';
import {logAudit} from './audit';

// Mutation: Create resident log
export async function createResidentLog(clerkUserId: string, residentId: string, template: string, content: string) {
	const userRole = await requireCareAccess(clerkUserId);

	// Check if resident exists and user has access
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
		throw new Error('Access denied to create logs for this resident');
	}

	// Get the next version number for this resident
	const existingLogs = await db.query.residentLogs.findMany({
		where: eq(residentLogs.residentId, residentId),
	});

	const nextVersion =
		Math.max(
			0,
			...existingLogs.map((log) =>
				typeof log.version === 'number' ? log.version : 0
			)
		) + 1;

	const [newLog] = await db.insert(residentLogs).values({
		residentId: residentId,
		authorId: clerkUserId,
		version: nextVersion,
		template: template,
		content: content,
		location: resident.location,
		createdAt: new Date(),
	}).returning();

	if (!newLog) {
		throw new Error('Failed to create resident log');
	}

	await logAudit({
		clerkUserId,
		event: 'create_resident_log',
		details: `residentId=${residentId},template=${template},version=${nextVersion}`,
		deviceId: 'system',
		location: '',
	});

	return newLog.id;
}

// Mutation: Edit resident log
export async function editResidentLog(args: {
  logId: string;
  residentId: string;
  template: string;
  fields: Record<string, any>;
  authorId: string;
  authorName: string;
}) {
  const { logId, residentId, template, fields, authorId, authorName } = args;
  const userRole = await requireCareAccess(authorId);

  // Check if resident exists and user has access
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
    throw new Error('Access denied to edit logs for this resident');
  }

  // Get the next version number for this resident and log
  const existingLogs = await db.query.residentLogs.findMany({
    where: and(eq(residentLogs.residentId, residentId), eq(residentLogs.template, template)),
  });

  const nextVersion =
    Math.max(
      0,
      ...existingLogs.map((log) =>
        typeof log.version === 'number' ? log.version : 0
      )
    ) + 1;

  const content =
    Object.keys(fields).length === 1 && typeof fields.content === 'string'
      ? fields.content
      : JSON.stringify(fields);

  const [updatedLog] = await db.insert(residentLogs).values({
    residentId: residentId,
    authorId: authorId,
    authorName: authorName,
    version: nextVersion,
    template: template,
    content,
    location: resident.location,
    createdAt: new Date(),
    // Assuming logId is the ID of the log being "edited" to create a new version
    // If the intention is to update the existing log entry, the logic would be different.
    // For now, this creates a new version as per the original Convex pattern.
  }).returning();

  if (!updatedLog) {
    throw new Error('Failed to edit resident log');
  }

  await logAudit({
    clerkUserId: authorId,
    event: 'edit_resident_log',
    details: `residentId=${residentId},template=${template},version=${nextVersion},originalLogId=${logId}`,
    deviceId: 'system',
    location: '',
  });

  return updatedLog.id;
}

// Mutation: Generate upload URL for selfie
export async function generateSelfieUploadUrl() {
	// In a real Next.js app, this would interact with a file storage service
	// like AWS S3, Vercel Blob, or a custom backend.
	// For now, return a placeholder URL.
	console.log('Placeholder: Generating selfie upload URL');
	return {
		url: 'https://placeholder.com/upload-selfie',
		// You might also return a unique ID for the file, and other metadata
		// that your frontend needs to upload the file.
	};
}

// Mutation: Acknowledge ISP
export async function acknowledgeIsp(clerkUserId: string, residentId: string, ispId: string) {
	await requireCareAccess(clerkUserId);

	const ispRecord = await db.query.isp.findFirst({
		where: and(eq(isp.id, ispId), eq(isp.published, true)),
	});

	if (!ispRecord) {
		throw new Error('ISP not found or not published');
	}

	await db.insert(ispAcknowledgments).values({
		residentId: residentId,
		clerkUserId,
		ispId: ispId,
		acknowledgedAt: new Date(),
		acknowledgedIsp: ispId, // This seems redundant, but keeping for consistency with Convex
	});

	await logAudit({
		clerkUserId,
		event: 'acknowledge_isp',
		details: `residentId=${residentId},ispId=${ispId}`,
		deviceId: 'system',
		location: '',
	});
	return true;
}

// Mutation: Clock in
export async function clockIn(clerkUserId: string, location: string, selfieStorageId?: string) {
	const userRole = await requireCareAccess(clerkUserId);

	// Check if user has access to the specified location
	const userLocations =
		userRole.role === 'admin' ? [] : userRole.locations || [];
	if (userRole.role !== 'admin' && !userLocations.includes(location)) {
		throw new Error('Access denied to clock in at this location');
	}

	// Check if selfie is enforced
	const appConfig = await db.query.config.findFirst();
	if (appConfig?.selfieEnforced && !selfieStorageId) {
		throw new Error('Selfie verification is required for clock in');
	}

	const existingShift = await db.query.shifts.findFirst({
		where: and(
			eq(shifts.clerkUserId, clerkUserId),
			isNull(shifts.clockOutTime)
		),
		orderBy: (shifts, {desc}) => [desc(shifts.clockInTime)],
	});

	if (existingShift) {
		if (existingShift.location === location) {
			throw new Error(`Already clocked in at ${existingShift.location}.`);
		}

		throw new Error(
			`Already clocked in at ${existingShift.location}. Clock out before switching locations.`
		);
	}

	let newShift;

	try {
		[newShift] = await db.insert(shifts).values({
			clerkUserId,
			location: location,
			clockInTime: new Date(),
			deviceId: 'web-browser', // Assuming 'web-browser' for now, can be passed from client
			clockInSelfie: selfieStorageId,
		}).returning();
	} catch (error: any) {
		if (error?.code === '23505' || error?.cause?.code === '23505') {
			throw new Error('Already clocked in. Please clock out first.');
		}

		throw error;
	}

	if (!newShift) {
		throw new Error('Failed to clock in');
	}

	await logAudit({
		clerkUserId,
		event: 'clock_in',
		details: `location=${location},selfie=${selfieStorageId ? 'yes' : 'no'}`,
		deviceId: 'system',
		location: '',
	});
	return newShift.id;
}

// Mutation: Clock out
export async function clockOut(clerkUserId: string, selfieStorageId?: string) {
	await requireCareAccess(clerkUserId);

	const currentShift = await db.query.shifts.findFirst({
		where: and(
			eq(shifts.clerkUserId, clerkUserId),
			isNull(shifts.clockOutTime)
		),
		orderBy: (shifts, {desc}) => [desc(shifts.clockInTime)],
	});

	if (!currentShift) {
		throw new Error('No active shift found');
	}

	await db.update(shifts).set({
		clockOutTime: new Date(),
		clockOutSelfie: selfieStorageId,
	}).where(eq(shifts.id, currentShift.id));

	const duration = Date.now() - currentShift.clockInTime.getTime();
	await logAudit({
		clerkUserId,
		event: 'clock_out',
		details: `location=${currentShift.location},selfie=${selfieStorageId ? 'yes' : 'no'}`,
		deviceId: 'system',
		location: '',
	});

	return {
		shiftId: currentShift.id,
		duration,
		location: currentShift.location,
	};
}
