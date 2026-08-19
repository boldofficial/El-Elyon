import {db} from '../index';
import {
	inspectorAccess,
	residents,
	residentLogs,
	incidentReports,
	ispFiles,
	fireEvac,
	fireDrills,
	smokeDetectorChecks,
} from '../schema';
import {eq, and, desc, inArray} from 'drizzle-orm';
import {hashOtp} from '@/lib/inspector-auth';

// Find a live (non-revoked, non-expired) grant matching a submitted OTP.
export async function findActiveInspectorAccessByOtp(otp: string) {
	const matches = await db.query.inspectorAccess.findMany({
		where: eq(inspectorAccess.otpHash, hashOtp(otp)),
	});
	const now = Date.now();
	return (
		matches.find(
			(m) => !m.revokedAt && m.expiresAt.getTime() > now
		) || null
	);
}

// List grants for the admin management view (newest first).
export async function listInspectorAccess() {
	return db.query.inspectorAccess.findMany({
		orderBy: [desc(inspectorAccess.createdAt)],
	});
}

// All read-only compliance data for a location, for the inspector dashboard.
export async function getInspectorLocationData(location: string) {
	const locationResidents = await db.query.residents.findMany({
		where: eq(residents.location, location),
	});
	const residentIds = locationResidents.map((r) => r.id);
	const residentName = new Map(locationResidents.map((r) => [r.id, r.name]));

	// Resident care logs (by location column).
	const logs = await db.query.residentLogs.findMany({
		where: eq(residentLogs.location, location),
		orderBy: [desc(residentLogs.timestamp)],
		limit: 500,
	});

	// Incident reports for the location.
	const incidents = await db.query.incidentReports.findMany({
		where: eq(incidentReports.location, location),
		orderBy: [desc(incidentReports.incidentDate)],
		with: {resident: true},
	});

	// Active ISP files for residents at the location.
	const isps = residentIds.length
		? (
				await db.query.ispFiles.findMany({
					where: and(
						inArray(ispFiles.residentId, residentIds),
						eq(ispFiles.status, 'active')
					),
					with: {resident: true},
					orderBy: [desc(ispFiles.effectiveDate)],
				})
		  ).map((f) => ({
				id: f.id,
				residentId: f.residentId,
				residentName: f.resident?.name || residentName.get(f.residentId) || 'Unknown',
				versionLabel: f.versionLabel,
				effectiveDate: f.effectiveDate,
				fileStorageId: f.fileStorageId,
				fileName: f.fileName,
				status: f.status,
		  }))
		: [];

	// Latest fire-evac plan per resident at the location.
	const fireEvacPlans = [];
	for (const resident of locationResidents) {
		const plans = await db.query.fireEvac.findMany({
			where: eq(fireEvac.residentId, resident.id),
			orderBy: [desc(fireEvac.createdAt)],
			limit: 1,
		});
		if (plans[0]) {
			fireEvacPlans.push({
				id: plans[0].id,
				residentId: resident.id,
				residentName: resident.name,
				version: plans[0].version,
				createdAt: plans[0].createdAt,
				fileStorageId: plans[0].fileStorageId,
				fileName: plans[0].fileName,
			});
		}
	}

	// Location-level fire safety.
	const drills = await db.query.fireDrills.findMany({
		where: eq(fireDrills.location, location),
		orderBy: [desc(fireDrills.date)],
	});
	const smokeChecks = await db.query.smokeDetectorChecks.findMany({
		where: eq(smokeDetectorChecks.location, location),
		orderBy: [desc(smokeDetectorChecks.date)],
	});

	return {
		location,
		residents: locationResidents.map((r) => ({id: r.id, name: r.name})),
		logs,
		incidents,
		isps,
		fireEvacPlans,
		fireDrills: drills,
		smokeDetectorChecks: smokeChecks,
	};
}

// The set of S3 file keys an inspector at this location is allowed to download.
export async function getInspectorAllowedFileIds(
	location: string
): Promise<Set<string>> {
	const data = await getInspectorLocationData(location);
	const ids = new Set<string>();

	for (const isp of data.isps) {
		if (isp.fileStorageId) ids.add(isp.fileStorageId);
	}
	for (const plan of data.fireEvacPlans) {
		if (plan.fileStorageId) ids.add(plan.fileStorageId);
	}
	for (const incident of data.incidents) {
		for (const att of incident.attachments || []) ids.add(att);
	}
	return ids;
}
