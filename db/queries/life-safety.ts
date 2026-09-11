import {db} from '@/db/index';
import {
	fireDrillParticipants,
	fireDrillReports,
	fireDrills,
	locationLegacyNames,
	lifeSafetyInspectionEntries,
	locations,
	residents,
	smokeDetectorChecks,
} from '@/db/schema';
import {requireCareAccess} from '@/lib/db-helpers';
import {and, asc, desc, eq, gt, gte, inArray, isNull, lte} from 'drizzle-orm';
import {groupFireDrillJoinRows} from './fire-drill-aggregate';
import {
	aliasesAreUnambiguous,
	matchUniqueAssignedLocations,
} from './life-safety-scope';

export class LifeSafetyNotFoundError extends Error {
	constructor(message = 'Life-safety record not found') {
		super(message);
		this.name = 'LifeSafetyNotFoundError';
	}
}

export class LifeSafetyConflictError extends Error {
	constructor(message = 'The record was changed by another user') {
		super(message);
		this.name = 'LifeSafetyConflictError';
	}
}

export type LifeSafetyAccessContext = {
	clerkUserId: string;
	isAdmin: boolean;
	locationNames: string[];
};

type AuthorizedLocation = {
	id: string;
	name: string;
};

export async function getLifeSafetyAccessContext(
	clerkUserId: string
): Promise<LifeSafetyAccessContext> {
	const role = await requireCareAccess(clerkUserId);
	return {
		clerkUserId,
		isAdmin: role.role === 'admin',
		locationNames: Array.from(new Set(role.locations || [])),
	};
}

export async function resolveActiveLocationById(
	locationId: string
): Promise<AuthorizedLocation | null> {
	const [location] = await db
		.select({id: locations.id, name: locations.name})
		.from(locations)
		.where(and(eq(locations.id, locationId), eq(locations.status, 'active')))
		.limit(1);
	return location || null;
}

export async function resolveActiveLocationByName(
	locationName: string
): Promise<AuthorizedLocation | null> {
	const rows = await db
		.select({id: locations.id, name: locations.name})
		.from(locations)
		.where(and(eq(locations.name, locationName), eq(locations.status, 'active')))
		.orderBy(asc(locations.id))
		.limit(2);
	return rows.length === 1 ? rows[0]! : null;
}

export async function resolveAuthorizedActiveLocations(
	context: LifeSafetyAccessContext
): Promise<AuthorizedLocation[] | null> {
	if (context.isAdmin) {
		return db
			.select({id: locations.id, name: locations.name})
			.from(locations)
			.where(eq(locations.status, 'active'))
			.orderBy(asc(locations.name), asc(locations.id));
	}

	const assignedNames = context.locationNames.map((name) => name.trim()).filter(Boolean);
	if (assignedNames.length !== context.locationNames.length) return null;
	if (assignedNames.length === 0) return [];

	const rows = await db
		.select({id: locations.id, name: locations.name})
		.from(locations)
		.where(and(eq(locations.status, 'active'), inArray(locations.name, assignedNames)))
		.orderBy(asc(locations.name), asc(locations.id));
	return matchUniqueAssignedLocations(context.locationNames, rows);
}

export async function listLocationAliases(locationId: string): Promise<string[] | null> {
	return listLocationAliasesForLocationIds([locationId]);
}

export async function listLocationAliasesForLocationIds(
	locationIds: string[]
): Promise<string[] | null> {
	const uniqueLocationIds = Array.from(
		new Set(locationIds.map((locationId) => locationId.trim()).filter(Boolean))
	);
	if (uniqueLocationIds.length === 0) return [];

	const scopedRows = await db
		.select({name: locationLegacyNames.name})
		.from(locationLegacyNames)
		.where(inArray(locationLegacyNames.locationId, uniqueLocationIds))
		.orderBy(asc(locationLegacyNames.createdAt), asc(locationLegacyNames.name));

	const aliasNames = Array.from(new Set(scopedRows.map((row) => row.name)));
	if (aliasNames.length === 0) return [];

	const collisions = await db
		.select({
			locationId: locationLegacyNames.locationId,
			name: locationLegacyNames.name,
		})
		.from(locationLegacyNames)
		.where(inArray(locationLegacyNames.name, aliasNames))
		.orderBy(asc(locationLegacyNames.name), asc(locationLegacyNames.locationId));

	if (!aliasesAreUnambiguous(collisions)) return null;

	return aliasNames;
}

export async function resolveAuthorizedLifeSafetyLocation(
	context: LifeSafetyAccessContext,
	locationId: string
) {
	const authorizedLocations = await resolveAuthorizedActiveLocations(context);
	if (!authorizedLocations || authorizedLocations.length === 0) {
		throw new LifeSafetyNotFoundError();
	}

	if (context.isAdmin) {
		const location = await resolveActiveLocationById(locationId);
		if (!location) throw new LifeSafetyNotFoundError();
		return location;
	}

	const location = authorizedLocations.find((entry) => entry.id === locationId);
	if (!location) throw new LifeSafetyNotFoundError();
	return location;
}

export async function resolveAuthorizedLegacyLocation(
	context: LifeSafetyAccessContext,
	locationName: string
): Promise<AuthorizedLocation> {
	const location = await resolveActiveLocationByName(locationName);
	if (!location) {
		throw new LifeSafetyNotFoundError();
	}

	if (context.isAdmin) {
		return location;
	}

	const authorizedLocations = await resolveAuthorizedActiveLocations(context);
	if (!authorizedLocations || authorizedLocations.length === 0) {
		throw new LifeSafetyNotFoundError();
	}
	if (!authorizedLocations.some((entry) => entry.id === location.id)) {
		throw new LifeSafetyNotFoundError();
	}
	return location;
}

export async function listAuthorizedLifeSafetyLocations(args: {clerkUserId: string}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const authorizedLocations = await resolveAuthorizedActiveLocations(context);
	if (!authorizedLocations) return [];
	return authorizedLocations;
}

export async function listLifeSafetyInspections(args: {
	clerkUserId: string;
	locationId: string;
	year: number;
	includeVoided?: boolean;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	await resolveAuthorizedLifeSafetyLocation(context, args.locationId);
	const conditions = [
		eq(lifeSafetyInspectionEntries.locationId, args.locationId),
		eq(lifeSafetyInspectionEntries.reportYear, args.year),
	];
	if (!args.includeVoided) conditions.push(isNull(lifeSafetyInspectionEntries.voidedAt));

	return db
		.select()
		.from(lifeSafetyInspectionEntries)
		.where(and(...conditions))
		.orderBy(
			asc(lifeSafetyInspectionEntries.reportMonth),
			asc(lifeSafetyInspectionEntries.equipmentType),
			asc(lifeSafetyInspectionEntries.createdAt)
		);
}

export async function getLifeSafetyInspection(args: {
	clerkUserId: string;
	id: string;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const authorizedLocations = await resolveAuthorizedActiveLocations(context);
	if (!authorizedLocations || authorizedLocations.length === 0) {
		throw new LifeSafetyNotFoundError();
	}
	const allowedLocationIds = authorizedLocations.map((location) => location.id);
	const [entry] = await db
		.select()
		.from(lifeSafetyInspectionEntries)
		.where(
			and(
				eq(lifeSafetyInspectionEntries.id, args.id),
				inArray(lifeSafetyInspectionEntries.locationId, allowedLocationIds)
			)
		)
		.limit(1);
	if (!entry) throw new LifeSafetyNotFoundError();
	return entry;
}

export async function listFireDrillReports(args: {
	clerkUserId: string;
	locationId: string;
	year: number;
	includeVoided?: boolean;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	await resolveAuthorizedLifeSafetyLocation(context, args.locationId);
	const conditions = [
		eq(fireDrillReports.locationId, args.locationId),
		eq(fireDrillReports.reportYear, args.year),
	];
	if (!args.includeVoided) conditions.push(isNull(fireDrillReports.voidedAt));
	const rows = await db
		.select({report: fireDrillReports, participant: fireDrillParticipants})
		.from(fireDrillReports)
		.leftJoin(
			fireDrillParticipants,
			eq(fireDrillParticipants.fireDrillReportId, fireDrillReports.id)
		)
		.where(and(...conditions))
		.orderBy(
			asc(fireDrillReports.drillType),
			asc(fireDrillReports.sequence),
			asc(fireDrillReports.drillDate),
			asc(fireDrillReports.createdAt),
			asc(fireDrillParticipants.position)
		);
	return groupFireDrillJoinRows(rows);
}

export type ResidentAdmissionDrillFact = {
	residentId: string;
	residentName: string;
	locationName: string;
	placementDate: Date | null;
	createdAt: Date | null;
	/** Latest active admission drill for the resident, any report year. */
	latestAdmissionDrill: {id: string; drillDate: string; reportYear: number} | null;
};

/**
 * Active residents paired with their most recent (non-voided) admission drill.
 * Deliberately not year-scoped: a resident placed on 30 December is drilled in
 * January, and the countdown must see across that boundary. `locationName`
 * narrows to one house; omit it for the compliance cron's all-houses sweep.
 */
export async function listResidentAdmissionDrillFacts(args?: {
	locationName?: string;
}): Promise<ResidentAdmissionDrillFact[]> {
	const conditions = [eq(residents.status, 'active')];
	if (args?.locationName) conditions.push(eq(residents.location, args.locationName));
	const rows = await db
		.select({
			residentId: residents.id,
			residentName: residents.name,
			locationName: residents.location,
			placementDate: residents.placementDate,
			createdAt: residents.createdAt,
			drill: {
				id: fireDrillReports.id,
				drillDate: fireDrillReports.drillDate,
				reportYear: fireDrillReports.reportYear,
			},
		})
		.from(residents)
		.leftJoin(
			fireDrillReports,
			and(
				eq(fireDrillReports.admissionResidentId, residents.id),
				eq(fireDrillReports.drillType, 'admission'),
				isNull(fireDrillReports.voidedAt)
			)
		)
		.where(and(...conditions))
		.orderBy(asc(residents.name), asc(residents.id), desc(fireDrillReports.drillDate));

	const facts = new Map<string, ResidentAdmissionDrillFact>();
	for (const row of rows) {
		// Rows arrive newest-drill-first per resident; keep the first one seen.
		if (!facts.has(row.residentId)) {
			facts.set(row.residentId, {
				residentId: row.residentId,
				residentName: row.residentName,
				locationName: row.locationName,
				placementDate: row.placementDate,
				createdAt: row.createdAt,
				latestAdmissionDrill: row.drill?.id ? row.drill : null,
			});
		}
	}
	return Array.from(facts.values());
}

export async function listAdmissionDrillFactsForLocation(args: {
	clerkUserId: string;
	locationId: string;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const location = await resolveAuthorizedLifeSafetyLocation(context, args.locationId);
	return listResidentAdmissionDrillFacts({locationName: location.name});
}

export async function getFireDrillReport(args: {
	clerkUserId: string;
	id: string;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const authorizedLocations = await resolveAuthorizedActiveLocations(context);
	if (!authorizedLocations || authorizedLocations.length === 0) {
		throw new LifeSafetyNotFoundError();
	}
	const allowedLocationIds = authorizedLocations.map((location) => location.id);
	const rows = await db
		.select({report: fireDrillReports, participant: fireDrillParticipants})
		.from(fireDrillReports)
		.leftJoin(
			fireDrillParticipants,
			eq(fireDrillParticipants.fireDrillReportId, fireDrillReports.id)
		)
		.where(
			and(
				eq(fireDrillReports.id, args.id),
				inArray(fireDrillReports.locationId, allowedLocationIds)
			)
		)
		.orderBy(asc(fireDrillParticipants.position));
	const [aggregate] = groupFireDrillJoinRows(rows);
	if (!aggregate) throw new LifeSafetyNotFoundError();
	return aggregate;
}

export async function listLifeSafetyResidents(args: {
	clerkUserId: string;
	locationId: string;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const location = await resolveAuthorizedLifeSafetyLocation(context, args.locationId);
	return db
		.select({id: residents.id, name: residents.name})
		.from(residents)
		.where(and(eq(residents.location, location.name), eq(residents.status, 'active')))
		.orderBy(asc(residents.name), asc(residents.id));
}

export async function listLegacySmokeDetectorChecks(args: {
	clerkUserId: string;
	location: string;
	year?: number;
	month?: number;
	cursor?: string;
	limit: number;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const location = await resolveAuthorizedLegacyLocation(context, args.location);
	const legacyLocationNames = await listLocationAliases(location.id);
	if (legacyLocationNames === null) throw new LifeSafetyNotFoundError();
	const conditions = [
		inArray(
			smokeDetectorChecks.location,
			legacyLocationNames.length > 0 ? legacyLocationNames : [location.name]
		),
	];
	if (args.cursor) conditions.push(gt(smokeDetectorChecks.id, args.cursor));
	if (args.year) {
		const startMonth = args.month ? args.month - 1 : 0;
		const endMonth = args.month ? args.month : 12;
		conditions.push(gte(smokeDetectorChecks.date, new Date(Date.UTC(args.year, startMonth, 1))));
		conditions.push(lte(smokeDetectorChecks.date, new Date(Date.UTC(args.year, endMonth, 0, 23, 59, 59, 999))));
	}
	const rows = await db
		.select()
		.from(smokeDetectorChecks)
		.where(and(...conditions))
		.orderBy(asc(smokeDetectorChecks.id))
		.limit(args.limit + 1);
	return page(rows, args.limit);
}

export async function getLegacySmokeDetectorCheck(args: {
	clerkUserId: string;
	id: string;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const authorizedLocations = await resolveAuthorizedActiveLocations(context);
	if (!authorizedLocations || authorizedLocations.length === 0) {
		throw new LifeSafetyNotFoundError();
	}
	const legacyLocationNames = await listLocationAliasesForLocationIds(
		authorizedLocations.map((location) => location.id)
	);
	if (legacyLocationNames === null) throw new LifeSafetyNotFoundError();
	const locationScope = inArray(
		smokeDetectorChecks.location,
		legacyLocationNames.length > 0
			? legacyLocationNames
			: authorizedLocations.map((location) => location.name)
	);
	const [row] = await db
		.select()
		.from(smokeDetectorChecks)
		.where(and(eq(smokeDetectorChecks.id, args.id), locationScope))
		.limit(1);
	if (!row) throw new LifeSafetyNotFoundError();
	return row;
}

export async function listLegacyFireDrills(args: {
	clerkUserId: string;
	location: string;
	year?: number;
	sequence?: number;
	cursor?: string;
	limit: number;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const location = await resolveAuthorizedLegacyLocation(context, args.location);
	const legacyLocationNames = await listLocationAliases(location.id);
	if (legacyLocationNames === null) throw new LifeSafetyNotFoundError();
	const conditions = [
		inArray(
			fireDrills.location,
			legacyLocationNames.length > 0 ? legacyLocationNames : [location.name]
		),
	];
	if (args.year) conditions.push(eq(fireDrills.year, args.year));
	if (args.sequence) conditions.push(eq(fireDrills.sequence, args.sequence));
	if (args.cursor) conditions.push(gt(fireDrills.id, args.cursor));
	const rows = await db
		.select()
		.from(fireDrills)
		.where(and(...conditions))
		.orderBy(asc(fireDrills.id))
		.limit(args.limit + 1);
	return page(rows, args.limit);
}

export async function getLegacyFireDrill(args: {
	clerkUserId: string;
	id: string;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const authorizedLocations = await resolveAuthorizedActiveLocations(context);
	if (!authorizedLocations || authorizedLocations.length === 0) {
		throw new LifeSafetyNotFoundError();
	}
	const legacyLocationNames = await listLocationAliasesForLocationIds(
		authorizedLocations.map((location) => location.id)
	);
	if (legacyLocationNames === null) throw new LifeSafetyNotFoundError();
	const locationScope = inArray(
		fireDrills.location,
		legacyLocationNames.length > 0
			? legacyLocationNames
			: authorizedLocations.map((location) => location.name)
	);
	const [row] = await db
		.select()
		.from(fireDrills)
		.where(and(eq(fireDrills.id, args.id), locationScope))
		.limit(1);
	if (!row) throw new LifeSafetyNotFoundError();
	return row;
}

function page<T extends {id: string}>(rows: T[], limit: number) {
	const hasMore = rows.length > limit;
	const data = hasMore ? rows.slice(0, limit) : rows;
	return {data, nextCursor: hasMore ? data.at(-1)?.id ?? null : null};
}
