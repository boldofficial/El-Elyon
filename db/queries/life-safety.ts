import {db} from '@/db/index';
import {
	fireDrillParticipants,
	fireDrillReports,
	fireDrills,
	lifeSafetyInspectionEntries,
	locations,
	residents,
	smokeDetectorChecks,
} from '@/db/schema';
import {requireCareAccess} from '@/lib/db-helpers';
import {and, asc, eq, gt, gte, inArray, isNull, lte} from 'drizzle-orm';

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

export async function resolveAuthorizedLifeSafetyLocation(
	context: LifeSafetyAccessContext,
	locationId: string
) {
	if (!context.isAdmin && context.locationNames.length === 0) {
		throw new LifeSafetyNotFoundError();
	}

	const conditions = [eq(locations.id, locationId)];
	if (!context.isAdmin) {
		conditions.push(inArray(locations.name, context.locationNames));
	}

	const [location] = await db
		.select({id: locations.id, name: locations.name})
		.from(locations)
		.where(and(...conditions))
		.limit(1);

	if (!location) throw new LifeSafetyNotFoundError();
	return location;
}

export async function resolveAuthorizedLegacyLocation(
	context: LifeSafetyAccessContext,
	locationName: string
): Promise<string> {
	if (!context.isAdmin && context.locationNames.length === 0) {
		throw new LifeSafetyNotFoundError();
	}

	const conditions = [eq(locations.name, locationName)];
	if (!context.isAdmin) {
		conditions.push(inArray(locations.name, context.locationNames));
	}
	const [location] = await db
		.select({name: locations.name})
		.from(locations)
		.where(and(...conditions))
		.limit(1);
	if (!location) throw new LifeSafetyNotFoundError();
	return location.name;
}

export async function listAuthorizedLifeSafetyLocations(args: {clerkUserId: string}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	if (!context.isAdmin && context.locationNames.length === 0) return [];

	const conditions = [eq(locations.status, 'active')];
	if (!context.isAdmin) conditions.push(inArray(locations.name, context.locationNames));

	return db
		.select({id: locations.id, name: locations.name})
		.from(locations)
		.where(and(...conditions))
		.orderBy(asc(locations.name), asc(locations.id));
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
	const allowedIds = await authorizedLocationIds(context);
	if (allowedIds.length === 0) throw new LifeSafetyNotFoundError();
	const [entry] = await db
		.select()
		.from(lifeSafetyInspectionEntries)
		.where(
			and(
				eq(lifeSafetyInspectionEntries.id, args.id),
				inArray(lifeSafetyInspectionEntries.locationId, allowedIds)
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
	const reports = await db
		.select()
		.from(fireDrillReports)
		.where(and(...conditions))
		.orderBy(asc(fireDrillReports.sequence), asc(fireDrillReports.createdAt));
	return attachParticipants(reports);
}

export async function getFireDrillReport(args: {
	clerkUserId: string;
	id: string;
}) {
	const context = await getLifeSafetyAccessContext(args.clerkUserId);
	const allowedIds = await authorizedLocationIds(context);
	if (allowedIds.length === 0) throw new LifeSafetyNotFoundError();
	const [report] = await db
		.select()
		.from(fireDrillReports)
		.where(
			and(
				eq(fireDrillReports.id, args.id),
				inArray(fireDrillReports.locationId, allowedIds)
			)
		)
		.limit(1);
	if (!report) throw new LifeSafetyNotFoundError();
	const [aggregate] = await attachParticipants([report]);
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
	const conditions = [eq(smokeDetectorChecks.location, location)];
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
	const allowedNames = await authorizedLocationNames(context);
	if (allowedNames.length === 0) throw new LifeSafetyNotFoundError();
	const [row] = await db
		.select()
		.from(smokeDetectorChecks)
		.where(and(eq(smokeDetectorChecks.id, args.id), inArray(smokeDetectorChecks.location, allowedNames)))
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
	const conditions = [eq(fireDrills.location, location)];
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
	const allowedNames = await authorizedLocationNames(context);
	if (allowedNames.length === 0) throw new LifeSafetyNotFoundError();
	const [row] = await db
		.select()
		.from(fireDrills)
		.where(and(eq(fireDrills.id, args.id), inArray(fireDrills.location, allowedNames)))
		.limit(1);
	if (!row) throw new LifeSafetyNotFoundError();
	return row;
}

async function authorizedLocationIds(context: LifeSafetyAccessContext): Promise<string[]> {
	if (!context.isAdmin && context.locationNames.length === 0) return [];
	const rows = await db
		.select({id: locations.id})
		.from(locations)
		.where(context.isAdmin ? undefined : inArray(locations.name, context.locationNames));
	return rows.map((row) => row.id);
}

async function authorizedLocationNames(context: LifeSafetyAccessContext): Promise<string[]> {
	if (!context.isAdmin) return context.locationNames;
	const rows = await db.select({name: locations.name}).from(locations);
	return Array.from(new Set(rows.map((row) => row.name)));
}

async function attachParticipants<T extends {id: string}>(reports: T[]) {
	if (reports.length === 0) return [] as Array<T & {participants: never[]}>;
	const participants = await db
		.select()
		.from(fireDrillParticipants)
		.where(inArray(fireDrillParticipants.fireDrillReportId, reports.map((report) => report.id)))
		.orderBy(asc(fireDrillParticipants.position));
	return reports.map((report) => ({
		...report,
		participants: participants.filter((participant) => participant.fireDrillReportId === report.id),
	}));
}

function page<T extends {id: string}>(rows: T[], limit: number) {
	const hasMore = rows.length > limit;
	const data = hasMore ? rows.slice(0, limit) : rows;
	return {data, nextCursor: hasMore ? data.at(-1)?.id ?? null : null};
}
