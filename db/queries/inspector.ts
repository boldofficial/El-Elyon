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
	locations,
	lifeSafetyInspectionEntries,
	fireDrillReports,
	fireDrillParticipants,
} from '../schema';
import {eq, and, asc, desc, inArray, isNull} from 'drizzle-orm';
import {hashOtp} from '@/lib/inspector-auth';
import {listLocationAliases} from './life-safety';
import {groupFireDrillJoinRows} from './fire-drill-aggregate';
import {
	projectInspectorLifeSafetyData,
	InspectorLifeSafetyScopeError,
} from '@/lib/inspector-life-safety-projection';

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

// Minimal life-safety projection for a live inspector session. The session's
// immutable location ID is the only scope input: route query parameters never
// enter this boundary.
export async function getInspectorLifeSafetyData(locationId: string) {
	const location = await db.query.locations.findFirst({
		where: and(eq(locations.id, locationId), eq(locations.status, 'active')),
	});
	if (!location) {
		throw new InspectorLifeSafetyScopeError();
	}
	const legacyNames = await listLocationAliases(location.id);
	if (legacyNames === null) {
		throw new InspectorLifeSafetyScopeError();
	}
	const legacyLocationNames = legacyNames.length > 0 ? legacyNames : [location.name];

	const [inspections, reportRows, legacySmokeChecks, legacyFireDrills] = await Promise.all([
		db
			.select({
				reportYear: lifeSafetyInspectionEntries.reportYear,
				reportMonth: lifeSafetyInspectionEntries.reportMonth,
				equipmentType: lifeSafetyInspectionEntries.equipmentType,
				inspectionDate: lifeSafetyInspectionEntries.inspectionDate,
				staffInitials: lifeSafetyInspectionEntries.staffInitials,
				outcome: lifeSafetyInspectionEntries.outcome,
				notes: lifeSafetyInspectionEntries.notes,
			})
			.from(lifeSafetyInspectionEntries)
			.where(and(
				eq(lifeSafetyInspectionEntries.locationId, location.id),
				isNull(lifeSafetyInspectionEntries.voidedAt)
			))
			.orderBy(
				desc(lifeSafetyInspectionEntries.reportYear),
				asc(lifeSafetyInspectionEntries.reportMonth),
				asc(lifeSafetyInspectionEntries.equipmentType)
			),
		db
			.select({
				report: {
					id: fireDrillReports.id,
					reportYear: fireDrillReports.reportYear,
					sequence: fireDrillReports.sequence,
					drillDate: fireDrillReports.drillDate,
					drillTime: fireDrillReports.drillTime,
					staffNames: fireDrillReports.staffNames,
				},
				participant: {
					fireDrillReportId: fireDrillParticipants.fireDrillReportId,
					residentNameSnapshot: fireDrillParticipants.residentNameSnapshot,
					durationMinutes: fireDrillParticipants.durationMinutes,
					durationSeconds: fireDrillParticipants.durationSeconds,
					comment: fireDrillParticipants.comment,
					position: fireDrillParticipants.position,
				},
			})
			.from(fireDrillReports)
			.leftJoin(
				fireDrillParticipants,
				eq(fireDrillParticipants.fireDrillReportId, fireDrillReports.id)
			)
			.where(and(
				eq(fireDrillReports.locationId, location.id),
				isNull(fireDrillReports.voidedAt)
			))
			.orderBy(
				desc(fireDrillReports.reportYear),
				asc(fireDrillReports.sequence),
				asc(fireDrillParticipants.position)
			),
		db
			.select({
				date: smokeDetectorChecks.date,
				smokeStatus: smokeDetectorChecks.smokeStatus,
				coStatus: smokeDetectorChecks.coStatus,
				staffInitials: smokeDetectorChecks.staffInitials,
				notes: smokeDetectorChecks.notes,
			})
			.from(smokeDetectorChecks)
			.where(inArray(smokeDetectorChecks.location, legacyLocationNames))
			.orderBy(desc(smokeDetectorChecks.date)),
		db
			.select({
				year: fireDrills.year,
				sequence: fireDrills.sequence,
				residentName: fireDrills.residentName,
				date: fireDrills.date,
				time: fireDrills.time,
				staffName: fireDrills.staffName,
				comment: fireDrills.comment,
			})
			.from(fireDrills)
			.where(inArray(fireDrills.location, legacyLocationNames))
			.orderBy(desc(fireDrills.year), asc(fireDrills.sequence), desc(fireDrills.date)),
	]);

	const aggregates = groupFireDrillJoinRows(reportRows);
	const reports = aggregates.map(({participants: _participants, ...report}) => report);
	const participants = aggregates.flatMap((report) => report.participants);

	return projectInspectorLifeSafetyData({
		location,
		inspections,
		fireDrills: reports,
		participants,
		legacySmokeChecks,
		legacyFireDrills,
	});
}
