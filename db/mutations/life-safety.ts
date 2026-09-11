import {db} from '@/db/index';
import {
	complianceAlerts,
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
import {selectFireDrillResidentNameSnapshot} from '@/lib/life-safety-reporting';
import {and, asc, eq, inArray, isNull, sql} from 'drizzle-orm';

type AuditActor = {id: string; name: string | null};

/**
 * Every mutation below used to run inside db.transaction(), which throws
 * unconditionally on this project's driver (drizzle-orm/neon-http - see
 * db/index.ts) and so had never actually executed successfully.
 *
 * They're rewritten here as sequential statements rather than a single
 * db.batch(). batch() sends every statement up front, before any result
 * comes back, so it can't express "only write the audit revision if the
 * update actually matched a row" - and that conditional is exactly what the
 * optimistic-concurrency checks below (`if (!entry) throw
 * LifeSafetyConflictError()`) depend on. Each statement here is
 * individually atomic; what's given up is strict all-or-nothing atomicity
 * across the pair (e.g. a report update succeeding but its audit-revision
 * insert failing immediately after). The revision log is a secondary audit
 * trail, not the record of truth - the entity being inspected/reported on is
 * written correctly either way - so that gap is judged an acceptable
 * trade for code this much simpler, especially given the whole call chain
 * was previously 100% broken with no prior working behavior to preserve.
 */

export async function createLifeSafetyInspection(args: {
	clerkUserId: string;
	input: LifeSafetyInspectionInput;
}) {
	try {
		const context = await getLifeSafetyAccessContext(args.clerkUserId);
		const location = await resolveAuthorizedLifeSafetyLocation(context, args.input.locationId);
		const actor = await resolveAuditActor(args.clerkUserId);

		const [entry] = await db
			.insert(lifeSafetyInspectionEntries)
			.values({
				...inspectionValues(args.input),
				houseNameSnapshot: location.name,
				createdBy: actor.id,
			})
			.returning();

		await insertInspectionRevision(entry, 'create', actor);
		return entry;
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

		const [entry] = await db
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
			entry,
			current.locationId === entry.locationId ? 'correct' : 'move',
			actor
		);
		return entry;
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

		const [entry] = await db
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

		await insertInspectionRevision(entry, 'void', actor, args.reason);
		return entry;
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

		const participants = await resolveParticipants(location.name, args.input.participants);
		const admission = resolveAdmissionResident(args.input, participants);

		const [report] = await db
			.insert(fireDrillReports)
			.values({
				...fireDrillValues(args.input),
				...admission,
				houseNameSnapshot: location.name,
				createdBy: actor.id,
			})
			.returning();

		const savedParticipants = await db
			.insert(fireDrillParticipants)
			.values(participants.map((participant) => ({...participant, fireDrillReportId: report.id})))
			.returning();

		const aggregate = {...report, participants: savedParticipants};
		await insertFireDrillRevision(aggregate, 'create', actor);
		if (report.admissionResidentId) await clearAdmissionDrillAlert(report.admissionResidentId);
		return aggregate;
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

		const participants = await resolveParticipants(
			destination.name,
			args.input.participants,
			current.participants
		);
		const admission = resolveAdmissionResident(args.input, participants, current);

		const [report] = await db
			.update(fireDrillReports)
			.set({
				...fireDrillValues(args.input),
				...admission,
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

		await db.delete(fireDrillParticipants).where(eq(fireDrillParticipants.fireDrillReportId, report.id));
		const savedParticipants = await db
			.insert(fireDrillParticipants)
			.values(participants.map((participant) => ({...participant, fireDrillReportId: report.id})))
			.returning();

		const aggregate = {...report, participants: savedParticipants};
		await insertFireDrillRevision(
			aggregate,
			current.locationId === report.locationId ? 'correct' : 'move',
			actor
		);
		return aggregate;
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

		const [report] = await db
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

		const participants = await db
			.select()
			.from(fireDrillParticipants)
			.where(eq(fireDrillParticipants.fireDrillReportId, report.id))
			.orderBy(asc(fireDrillParticipants.position));

		const aggregate = {...report, participants};
		await insertFireDrillRevision(aggregate, 'void', actor, args.reason);
		return aggregate;
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
		drillType: input.drillType,
		sequence: input.sequence,
		drillDate: input.drillDate,
		drillTime: input.drillTime,
		staffNames: input.staffNames,
	};
}

// The admission resident's name snapshot is taken from their participant row
// (validation guarantees the resident is a roster participant), so the report
// header and the result column can never disagree. On correction, an
// unchanged resident keeps the snapshot already on the report.
function resolveAdmissionResident(
	input: FireDrillReportInput,
	participants: {residentId: string | null; residentNameSnapshot: string}[],
	current?: Pick<
		typeof fireDrillReports.$inferSelect,
		'admissionResidentId' | 'admissionResidentNameSnapshot'
	>
) {
	if (input.drillType !== 'admission' || !input.admissionResidentId) {
		return {admissionResidentId: null, admissionResidentNameSnapshot: null};
	}
	if (
		current?.admissionResidentId === input.admissionResidentId &&
		current.admissionResidentNameSnapshot
	) {
		return {
			admissionResidentId: current.admissionResidentId,
			admissionResidentNameSnapshot: current.admissionResidentNameSnapshot,
		};
	}
	const participant = participants.find(
		(candidate) => candidate.residentId === input.admissionResidentId
	);
	if (!participant) throw new LifeSafetyNotFoundError('Resident not found');
	return {
		admissionResidentId: participant.residentId,
		admissionResidentNameSnapshot: participant.residentNameSnapshot,
	};
}

// Recording the admission drill satisfies the reminder, so resolve it now
// rather than leaving it on dashboards until the next cron sweep (mirrors
// activateISPFile). The cron re-creates it if the drill is later voided.
async function clearAdmissionDrillAlert(residentId: string) {
	await db
		.update(complianceAlerts)
		.set({active: false, status: 'resolved'})
		.where(
			and(
				eq(complianceAlerts.type, 'admission_drill'),
				eq(complianceAlerts.active, true),
				sql`${complianceAlerts.metadata}->>'residentId' = ${residentId}`
			)
		);
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

async function resolveParticipants(
	locationName: string,
	inputs: FireDrillParticipantInput[],
	existingParticipants: Pick<
		typeof fireDrillParticipants.$inferSelect,
		'residentId' | 'residentNameSnapshot'
	>[] = []
) {
	const snapshotByResidentId = new Map(
		existingParticipants
			.filter((participant): participant is {residentId: string; residentNameSnapshot: string} =>
				participant.residentId !== null
			)
			.map((participant) => [participant.residentId, participant.residentNameSnapshot])
	);
	const rosterIds = inputs
		.filter((participant) => participant.participantSource === 'roster')
		.map((participant) => participant.residentId)
		.filter((id): id is string => Boolean(id));
	const rosterRows = rosterIds.length
		? await db
				.select({id: residents.id, name: residents.name})
				.from(residents)
				.where(and(inArray(residents.id, rosterIds), eq(residents.location, locationName)))
		: [];
	if (rosterRows.length !== rosterIds.length) throw new LifeSafetyNotFoundError('Resident not found');
	const rosterById = new Map(rosterRows.map((resident) => [resident.id, resident.name]));
	return inputs.map((participant) => ({
		residentId: participant.residentId,
		residentNameSnapshot: selectFireDrillResidentNameSnapshot({
			participant,
			snapshotByResidentId,
			rosterById,
		}),
		participantSource: participant.participantSource,
		durationMinutes: participant.durationMinutes,
		durationSeconds: participant.durationSeconds,
		comment: participant.comment ?? null,
		position: participant.position,
	}));
}

async function insertInspectionRevision(
	entry: typeof lifeSafetyInspectionEntries.$inferSelect,
	action: 'create' | 'correct' | 'move' | 'void',
	actor: AuditActor,
	reason?: string
) {
	await db.insert(lifeSafetyReportRevisions).values({
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
	aggregate: typeof fireDrillReports.$inferSelect & {
		participants: (typeof fireDrillParticipants.$inferSelect)[];
	},
	action: 'create' | 'correct' | 'move' | 'void',
	actor: AuditActor,
	reason?: string
) {
	await db.insert(lifeSafetyReportRevisions).values({
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
