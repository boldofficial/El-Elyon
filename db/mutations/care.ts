import {db} from '../index';
import {residents, residentLogs, config, shifts, isp, ispAcknowledgments} from '../schema';
import {eq, and, isNull} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';
import {logAudit} from './audit';
import {
	getOperationalTimeZone,
	resolveAuthorizedCareLocation,
	type CurrentShiftDto,
} from '../queries/care';
import {computeOperationalDate} from '@/lib/operational-time';
import {shiftSlotSchema, type ShiftSlot} from '@/lib/water-temperature';

export class CareShiftValidationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CareShiftValidationError';
	}
}

export class CareShiftAccessDeniedError extends Error {
	constructor(message = 'Access denied to clock in at this location') {
		super(message);
		this.name = 'CareShiftAccessDeniedError';
	}
}

export class CareShiftConflictError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CareShiftConflictError';
	}
}

export class CareShiftNotFoundError extends Error {
	constructor(message = 'No active shift found') {
		super(message);
		this.name = 'CareShiftNotFoundError';
	}
}

function toCurrentShiftDto(shift: {
	id: string;
	location: string;
	locationId: string | null;
	shiftSlot: number | null;
	operationalDate: string | null;
	clockInTime: Date;
}): CurrentShiftDto {
	return {
		id: shift.id,
		locationId: shift.locationId,
		location: shift.location,
		shiftSlot: (shift.shiftSlot as ShiftSlot | null) ?? null,
		operationalDate: shift.operationalDate,
		clockInTime: shift.clockInTime,
		duration: Date.now() - shift.clockInTime.getTime(),
		needsClassification: shift.locationId === null,
	};
}

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

  // Carry the original log's shift link forward so an edited log stays
  // associated with the shift it was written during (each edit inserts a
  // new versioned row rather than updating in place -- see insert below).
  const originalLog = await db.query.residentLogs.findFirst({
    where: eq(residentLogs.id, logId),
  });

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
    shiftId: originalLog?.shiftId,
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
//
// R1/R2/R16: requires an authorized house and a fixed shift slot; resolves
// the client-supplied location name to its immutable ID fail-closed
// (unauthorized/inactive/blank/ambiguous names never widen an active
// shift), and freezes the operational date + timezone snapshot from the
// canonical organization setting into a single atomic insert.
//
// Note: this does not wrap its reads/write in `db.transaction(...)`. This
// project's `db` client (drizzle-orm/neon-http, see db/index.ts) does not
// support multi-statement transactions -- `db.transaction()` throws "No
// transactions support in neon-http driver" unconditionally at runtime.
// Instead, every column that must be frozen together (locationId,
// shiftSlot, operationalDate, operationalTimeZoneSnapshot) is computed
// before a single `insert(...).returning()` statement, so the shift row
// itself is always internally consistent even though the preceding reads
// are separate round trips.
export async function clockIn(
	clerkUserId: string,
	location: string,
	shiftSlotInput: unknown,
	selfieStorageId?: string
) {
	const userRole = await requireCareAccess(clerkUserId);

	const slotResult = shiftSlotSchema.safeParse(shiftSlotInput);
	if (!slotResult.success) {
		throw new CareShiftValidationError(
			'Select a shift (1st, 2nd, or 3rd) before clocking in.'
		);
	}
	const shiftSlot = slotResult.data;

	if (typeof location !== 'string' || !location.trim()) {
		throw new CareShiftValidationError('Select a location before clocking in.');
	}

	// Check if selfie is enforced
	const appConfig = await db.query.config.findFirst();
	if (appConfig?.selfieEnforced && !selfieStorageId) {
		throw new CareShiftValidationError(
			'Selfie verification is required for clock in'
		);
	}

	const authorizedLocationNames =
		userRole.role === 'admin' ? [] : userRole.locations || [];

	const resolvedLocation = await resolveAuthorizedCareLocation(db, {
		role: userRole.role,
		authorizedLocationNames,
		locationName: location,
	});
	if (!resolvedLocation) {
		throw new CareShiftAccessDeniedError();
	}

	const existingShift = await db.query.shifts.findFirst({
		where: and(
			eq(shifts.clerkUserId, clerkUserId),
			isNull(shifts.clockOutTime)
		),
		orderBy: (shifts, {desc}) => [desc(shifts.clockInTime)],
	});

	if (existingShift) {
		if (existingShift.location === resolvedLocation.name) {
			throw new CareShiftConflictError(
				`Already clocked in at ${existingShift.location}.`
			);
		}

		throw new CareShiftConflictError(
			`Already clocked in at ${existingShift.location}. Clock out before switching locations.`
		);
	}

	// R2/R16-17: freeze the operational date/timezone from the canonical
	// setting now, so it is written atomically with the rest of the row in
	// the insert below. An absent/invalid configuration fails clock-in
	// visibly rather than falling back to the browser or database host
	// timezone.
	const operationalTimeZone = await getOperationalTimeZone(db);
	const clockInTime = new Date();
	const operationalDate = computeOperationalDate(
		clockInTime,
		operationalTimeZone
	);

	let newShift;
	try {
		[newShift] = await db
			.insert(shifts)
			.values({
				clerkUserId,
				location: resolvedLocation.name,
				locationId: resolvedLocation.id,
				shiftSlot,
				operationalDate,
				operationalTimeZoneSnapshot: operationalTimeZone,
				clockInTime,
				deviceId: 'web-browser', // Assuming 'web-browser' for now, can be passed from client
				clockInSelfie: selfieStorageId,
			})
			.returning();
	} catch (error: any) {
		if (error?.code === '23505' || error?.cause?.code === '23505') {
			throw new CareShiftConflictError(
				'Already clocked in. Please clock out first.'
			);
		}

		throw error;
	}

	if (!newShift) {
		throw new Error('Failed to clock in');
	}

	await logAudit({
		clerkUserId,
		event: 'clock_in',
		details: `location=${resolvedLocation.name},shiftSlot=${shiftSlot},operationalDate=${operationalDate},selfie=${selfieStorageId ? 'yes' : 'no'}`,
		deviceId: 'system',
		location: '',
	});
	return newShift.id;
}

// Mutation: Classify a legacy open shift (one clocked in before the daily
// water-temperature check feature existed, so it has null
// locationId/shiftSlot/operationalDate/operationalTimeZoneSnapshot).
//
// This is a one-time transition: it resolves the shift's original location
// name fail-closed, accepts a single authorized slot from staff, and
// freezes the operational date from the *original* clock-in timestamp (not
// "now"). A second classification attempt on an already-classified shift
// conflicts rather than silently overwriting the frozen identity (R2's
// immutability guarantee applies to legacy shifts too).
//
// As in clockIn above, this does not use `db.transaction(...)` (unsupported
// by this project's neon-http driver). The "classify once" guarantee comes
// from the `isNull(shifts.locationId)` compare-and-swap condition on the
// single UPDATE statement below: Postgres evaluates that WHERE clause
// atomically, so a concurrent second classification attempt updates zero
// rows rather than racing the first.
export async function classifyCurrentShift(
	clerkUserId: string,
	shiftSlotInput: unknown
): Promise<CurrentShiftDto> {
	const userRole = await requireCareAccess(clerkUserId);

	const slotResult = shiftSlotSchema.safeParse(shiftSlotInput);
	if (!slotResult.success) {
		throw new CareShiftValidationError(
			'Select a shift (1st, 2nd, or 3rd) to classify this shift.'
		);
	}
	const shiftSlot = slotResult.data;

	const authorizedLocationNames =
		userRole.role === 'admin' ? [] : userRole.locations || [];

	const currentShift = await db.query.shifts.findFirst({
		where: and(
			eq(shifts.clerkUserId, clerkUserId),
			isNull(shifts.clockOutTime)
		),
		orderBy: (shifts, {desc}) => [desc(shifts.clockInTime)],
	});

	if (!currentShift) {
		throw new CareShiftNotFoundError();
	}

	if (currentShift.locationId !== null) {
		// Already classified (either at clock-in or by a prior
		// classification call) -- do not allow staff to change frozen
		// identity after the fact.
		throw new CareShiftConflictError('This shift is already classified.');
	}

	const resolvedLocation = await resolveAuthorizedCareLocation(db, {
		role: userRole.role,
		authorizedLocationNames,
		locationName: currentShift.location,
	});
	if (!resolvedLocation) {
		throw new CareShiftAccessDeniedError(
			'Unable to resolve this shift to an authorized active location.'
		);
	}

	const operationalTimeZone = await getOperationalTimeZone(db);
	const operationalDate = computeOperationalDate(
		currentShift.clockInTime,
		operationalTimeZone
	);

	const [classifiedShift] = await db
		.update(shifts)
		.set({
			locationId: resolvedLocation.id,
			location: resolvedLocation.name,
			shiftSlot,
			operationalDate,
			operationalTimeZoneSnapshot: operationalTimeZone,
		})
		.where(
			and(
				eq(shifts.id, currentShift.id),
				eq(shifts.clerkUserId, clerkUserId),
				isNull(shifts.clockOutTime),
				isNull(shifts.locationId)
			)
		)
		.returning();

	// The compare-and-swap `isNull(shifts.locationId)` guard means a
	// concurrent second classification attempt updates zero rows here
	// rather than overwriting the winner's frozen identity.
	if (!classifiedShift) {
		throw new CareShiftConflictError('This shift is already classified.');
	}

	await logAudit({
		clerkUserId,
		event: 'classify_shift',
		details: `shiftId=${classifiedShift.id},location=${resolvedLocation.name},shiftSlot=${shiftSlot},operationalDate=${operationalDate}`,
		deviceId: 'system',
		location: '',
	});

	return toCurrentShiftDto(classifiedShift);
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
