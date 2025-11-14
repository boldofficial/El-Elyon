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
	});

	if (existingShift) {
		throw new Error('Already clocked in. Please clock out first.');
	}

	const [newShift] = await db.insert(shifts).values({
		clerkUserId,
		location: location,
		clockInTime: new Date(),
		deviceId: 'web-browser', // Assuming 'web-browser' for now, can be passed from client
		clockInSelfie: selfieStorageId,
	}).returning();

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
