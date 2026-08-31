import {db} from '@/db/index';
import {
	employees,
	fireDrillParticipants,
	fireDrillReports,
	lifeSafetyInspectionEntries,
	lifeSafetyReportRevisions,
	residents,
	users,
} from '@/db/schema';
import {
	LifeSafetyConflictError,
	LifeSafetyNotFoundError,
	getFireDrillReport,
	getLifeSafetyAccessContext,
	getLifeSafetyInspection,
	resolveAuthorizedLifeSafetyLocation,
} from '@/db/queries/life-safety';
import type {
	FireDrillParticipantInput,
	FireDrillReportInput,
	LifeSafetyInspectionInput,
} from '@/lib/life-safety-reporting';
import {and, asc, eq, inArray, isNull} from 'drizzle-orm';

type AuditActor = {id: string; name: string | null};

export async function createLifeSafetyInspection(args: {
	clerkUserId: string;
	input: LifeSafetyInspectionInput;
}) {
	try {
		const context = await getLifeSafetyAccessContext(args.clerkUserId);
		const location = await resolveAuthorizedLifeSafetyLocation(context, args.input.locationId);
		const actor = await resolveAuditActor(args.clerkUserId);
		return await db.transaction(async (tx) => {
			const [entry] = await tx
				.insert(lifeSafetyInspectionEntries)
				.values({
					...inspectionValues(args.input),
					houseNameSnapshot: location.name,
					createdBy: actor.id,
				})
				.returning();
			await insertInspectionRevision(tx, entry, 'create', actor);
			return entry;
		});
	} catch (error) {
		throw translateMutationError(error);
	}
}

export async function updateLifeSafetyInspection(args: {
	clerkUserId: string;
	id: string;
	expectedVersion: number;
	input: LifeSafetyInspectionInput;
}) {
	try {
		const current = await getLifeSafetyInspection({clerkUserId: args.clerkUserId, id: args.id});
		if (current.version !== args.expectedVersion || current.voidedAt) {
			throw new LifeSafetyConflictError();
		}
		const context = await getLifeSafetyAccessContext(args.clerkUserId);
		const destination = await resolveAuthorizedLifeSafetyLocation(context, args.input.locationId);
		const actor = await resolveAuditActor(args.clerkUserId);
		return await db.transaction(async (tx) => {
			const [entry] = await tx
				.update(lifeSafetyInspectionEntries)
				.set({
					...inspectionValues(args.input),
					houseNameSnapshot: destination.name,
					version: args.expectedVersion + 1,
					updatedBy: actor.id,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(lifeSafetyInspectionEntries.id, args.id),
						eq(lifeSafetyInspectionEntries.locationId, current.locationId),
						eq(lifeSafetyInspectionEntries.version, args.expectedVersion),
						isNull(lifeSafetyInspectionEntries.voidedAt)
					)
				)
				.returning();
			if (!entry) throw new LifeSafetyConflictError();
			await insertInspectionRevision(
				tx,
				entry,
				current.locationId === entry.locationId ? 'correct' : 'move',
				actor
			);
			return entry;
		});
	} catch (error) {
		throw translateMutationError(error);
	}
}

export async function voidLifeSafetyInspection(args: {
	clerkUserId: string;
	id: string;
	expectedVersion: number;
	reason: string;
}) {
	try {
		const current = await getLifeSafetyInspection({clerkUserId: args.clerkUserId, id: args.id});
		if (current.version !== args.expectedVersion || current.voidedAt) {
			throw new LifeSafetyConflictError();
		}
		const actor = await resolveAuditActor(args.clerkUserId);
		return await db.transaction(async (tx) => {
			const [entry] = await tx
				.update(lifeSafetyInspectionEntries)
				.set({
					version: args.expectedVersion + 1,
					voidedAt: new Date(),
					voidedBy: actor.id,
					voidReason: args.reason,
					updatedBy: actor.id,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(lifeSafetyInspectionEntries.id, args.id),
						eq(lifeSafetyInspectionEntries.locationId, current.locationId),
						eq(lifeSafetyInspectionEntries.version, args.expectedVersion),
						isNull(lifeSafetyInspectionEntries.voidedAt)
					)
				)
				.returning();
			if (!entry) throw new LifeSafetyConflictError();
			await insertInspectionRevision(tx, entry, 'void', actor, args.reason);
			return entry;
		});
	} catch (error) {
		throw translateMutationError(error);
	}
}

export async function createFireDrillReport(args: {
	clerkUserId: string;
	input: FireDrillReportInput;
}) {
	try {
		const context = await getLifeSafetyAccessContext(args.clerkUserId);
		const location = await resolveAuthorizedLifeSafetyLocation(context, args.input.locationId);
		const actor = await resolveAuditActor(args.clerkUserId);
		return await db.transaction(async (tx) => {
			const participants = await resolveParticipants(tx, location.name, args.input.participants);
			const [report] = await tx
				.insert(fireDrillReports)
				.values({
					...fireDrillValues(args.input),
					houseNameSnapshot: location.name,
					createdBy: actor.id,
				})
				.returning();
			const savedParticipants = await tx
				.insert(fireDrillParticipants)
				.values(participants.map((participant) => ({...participant, fireDrillReportId: report.id})))
				.returning();
			const aggregate = {...report, participants: savedParticipants};
			await insertFireDrillRevision(tx, aggregate, 'create', actor);
			return aggregate;
		});
	} catch (error) {
		throw translateMutationError(error);
	}
}

export async function updateFireDrillReport(args: {
	clerkUserId: string;
	id: string;
	expectedVersion: number;
	input: FireDrillReportInput;
}) {
	try {
		const current = await getFireDrillReport({clerkUserId: args.clerkUserId, id: args.id});
		if (current.version !== args.expectedVersion || current.voidedAt) {
			throw new LifeSafetyConflictError();
		}
		const context = await getLifeSafetyAccessContext(args.clerkUserId);
		const destination = await resolveAuthorizedLifeSafetyLocation(context, args.input.locationId);
		const actor = await resolveAuditActor(args.clerkUserId);
		return await db.transaction(async (tx) => {
			const participants = await resolveParticipants(tx, destination.name, args.input.participants);
			const [report] = await tx
				.update(fireDrillReports)
				.set({
					...fireDrillValues(args.input),
					houseNameSnapshot: destination.name,
					version: args.expectedVersion + 1,
					updatedBy: actor.id,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(fireDrillReports.id, args.id),
						eq(fireDrillReports.locationId, current.locationId),
						eq(fireDrillReports.version, args.expectedVersion),
						isNull(fireDrillReports.voidedAt)
					)
				)
				.returning();
			if (!report) throw new LifeSafetyConflictError();
			await tx.delete(fireDrillParticipants).where(eq(fireDrillParticipants.fireDrillReportId, report.id));
			const savedParticipants = await tx
				.insert(fireDrillParticipants)
				.values(participants.map((participant) => ({...participant, fireDrillReportId: report.id})))
				.returning();
			const aggregate = {...report, participants: savedParticipants};
			await insertFireDrillRevision(
				tx,
				aggregate,
				current.locationId === report.locationId ? 'correct' : 'move',
				actor
			);
			return aggregate;
		});
	} catch (error) {
		throw translateMutationError(error);
	}
}

export async function voidFireDrillReport(args: {
	clerkUserId: string;
	id: string;
	expectedVersion: number;
	reason: string;
}) {
	try {
		const current = await getFireDrillReport({clerkUserId: args.clerkUserId, id: args.id});
		if (current.version !== args.expectedVersion || current.voidedAt) {
			throw new LifeSafetyConflictError();
		}
		const actor = await resolveAuditActor(args.clerkUserId);
		return await db.transaction(async (tx) => {
			const [report] = await tx
				.update(fireDrillReports)
				.set({
					version: args.expectedVersion + 1,
					voidedAt: new Date(),
					voidedBy: actor.id,
					voidReason: args.reason,
					updatedBy: actor.id,
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(fireDrillReports.id, args.id),
						eq(fireDrillReports.locationId, current.locationId),
						eq(fireDrillReports.version, args.expectedVersion),
						isNull(fireDrillReports.voidedAt)
					)
				)
				.returning();
			if (!report) throw new LifeSafetyConflictError();
			const participants = await tx
				.select()
				.from(fireDrillParticipants)
				.where(eq(fireDrillParticipants.fireDrillReportId, report.id))
				.orderBy(asc(fireDrillParticipants.position));
			const aggregate = {...report, participants};
			await insertFireDrillRevision(tx, aggregate, 'void', actor, args.reason);
			return aggregate;
		});
	} catch (error) {
		throw translateMutationError(error);
	}
}

function inspectionValues(input: LifeSafetyInspectionInput) {
	return {
		locationId: input.locationId,
		reportYear: input.reportYear,
		reportMonth: input.reportMonth,
		equipmentType: input.equipmentType,
		inspectionDate: input.inspectionDate,
		staffInitials: input.staffInitials,
		outcome: input.outcome,
		notes: input.notes ?? null,
	};
}

function fireDrillValues(input: FireDrillReportInput) {
	return {
		locationId: input.locationId,
		reportYear: input.reportYear,
		sequence: input.sequence,
		drillDate: input.drillDate,
		drillTime: input.drillTime,
		staffNames: input.staffNames,
	};
}

async function resolveAuditActor(clerkUserId: string): Promise<AuditActor> {
	const [[employee], [user]] = await Promise.all([
		db
			.select({name: employees.name})
			.from(employees)
			.where(eq(employees.clerkUserId, clerkUserId))
			.limit(1),
		db
			.select({name: users.name})
			.from(users)
			.where(eq(users.clerkUserId, clerkUserId))
			.limit(1),
	]);
	return {id: clerkUserId, name: employee?.name || user?.name || null};
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function resolveParticipants(
	tx: Transaction,
	locationName: string,
	inputs: FireDrillParticipantInput[]
) {
	const rosterIds = inputs
		.filter((participant) => participant.participantSource === 'roster')
		.map((participant) => participant.residentId)
		.filter((id): id is string => Boolean(id));
	const rosterRows = rosterIds.length
		? await tx
				.select({id: residents.id, name: residents.name})
				.from(residents)
				.where(and(inArray(residents.id, rosterIds), eq(residents.location, locationName)))
		: [];
	if (rosterRows.length !== rosterIds.length) throw new LifeSafetyNotFoundError('Resident not found');
	const rosterById = new Map(rosterRows.map((resident) => [resident.id, resident.name]));
	return inputs.map((participant) => ({
		residentId: participant.residentId,
		residentNameSnapshot:
			participant.participantSource === 'roster'
				? rosterById.get(participant.residentId as string) as string
				: participant.residentNameSnapshot,
		participantSource: participant.participantSource,
		durationMinutes: participant.durationMinutes,
		durationSeconds: participant.durationSeconds,
		comment: participant.comment ?? null,
		position: participant.position,
	}));
}

async function insertInspectionRevision(
	tx: Transaction,
	entry: typeof lifeSafetyInspectionEntries.$inferSelect,
	action: 'create' | 'correct' | 'move' | 'void',
	actor: AuditActor,
	reason?: string
) {
	await tx.insert(lifeSafetyReportRevisions).values({
		inspectionEntryId: entry.id,
		entityType: 'inspection',
		version: entry.version,
		action,
		snapshot: {...entry},
		reason: reason ?? null,
		actorId: actor.id,
		actorNameSnapshot: actor.name,
	});
}

async function insertFireDrillRevision(
	tx: Transaction,
	aggregate: typeof fireDrillReports.$inferSelect & {
		participants: (typeof fireDrillParticipants.$inferSelect)[];
	},
	action: 'create' | 'correct' | 'move' | 'void',
	actor: AuditActor,
	reason?: string
) {
	await tx.insert(lifeSafetyReportRevisions).values({
		fireDrillReportId: aggregate.id,
		entityType: 'fire_drill',
		version: aggregate.version,
		action,
		snapshot: {...aggregate},
		reason: reason ?? null,
		actorId: actor.id,
		actorNameSnapshot: actor.name,
	});
}

function translateMutationError(error: unknown): Error {
	if (error instanceof LifeSafetyConflictError || error instanceof LifeSafetyNotFoundError) return error;
	const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
	if (code === '23505') return new LifeSafetyConflictError('A record already exists for this report slot');
	return error instanceof Error ? error : new Error('Life-safety mutation failed');
}
