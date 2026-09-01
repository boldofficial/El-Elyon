import {db} from '@/db/index';
import {requireAdminOrSupervisorAccess} from '@/lib/db-helpers';
import {
	deriveWaterTemperatureState,
	nextRecheckSequence,
	tenthsToFahrenheit,
	classifyFixtureReading,
	type ShiftSlot,
	type WaterTemperatureCheckState,
	type WaterTemperatureFixture,
	type WaterTemperatureRecheckFact,
} from '@/lib/water-temperature';
import {sql, type SQL} from 'drizzle-orm';
import {
	WaterTemperatureConflictError,
	WaterTemperatureNotFoundError,
	WaterTemperatureShiftRequiredError,
	getActiveShiftIdentity,
	getWaterTemperatureAccessContext,
	getWaterTemperatureCheck,
	resolveAuthorizedWaterTemperatureLocation,
	resolveStaffSnapshot,
	type WaterTemperatureCheckDto,
	type WaterTemperatureRecheckDto,
} from '@/db/queries/water-temperature';

// ============================================================================
// EXECUTOR
//
// See the CRITICAL note in the U3 task brief: this project's `db` client
// (drizzle-orm/neon-http) does not support `db.transaction()` -- it throws
// unconditionally at runtime. Every write below is instead expressed as a
// single multi-CTE SQL statement (atomic in Postgres without an explicit
// BEGIN) executed via `.execute(sql\`...\`)`.
//
// Every function in this module takes an `executor` (defaulting to the
// production `db`) rather than calling `db.execute` directly, so the
// integration test (db/water-temperature.integration.test.ts) can pass a
// `drizzle-orm/node-postgres` instance pointed at a dockerized Postgres and
// exercise this exact production code -- not hand-copied SQL -- for the
// concurrency/atomicity proofs (two simultaneous creates; a stale recheck
// racing a void). `db` (neon-http) cannot itself be repointed at a plain
// Postgres container, since neon-http speaks Neon's HTTP wire protocol, not
// the Postgres wire protocol a local/dockerized Postgres understands -- so a
// same-driver test is not possible here; this executor seam is the
// practical way to prove the actual mutation code atomic against a real
// server instead of just asserting it in a comment.
// ============================================================================

export interface WaterTemperatureExecutor {
	execute<T extends Record<string, unknown> = Record<string, unknown>>(
		query: SQL
	): PromiseLike<{rows: T[]}>;
}

async function run<T extends Record<string, unknown>>(
	executor: WaterTemperatureExecutor,
	query: SQL
): Promise<T[]> {
	const result = await executor.execute<T>(query);
	return result.rows;
}

// ============================================================================
// RAW ROW -> DTO MAPPING
//
// Every write's result set is captured via `to_jsonb(...)` rather than
// plain column projection, for two reasons: (1) it avoids ambiguous/
// overlapping column names when a statement joins multiple CTEs (e.g. the
// recheck append joins the updated check row with the inserted recheck
// row, both of which have an `id`/`created_by`/... column), and (2)
// Postgres's to_jsonb() always serializes timestamp columns as text
// consistently, regardless of which driver executes the query -- so these
// mappers behave identically whether `executor` is the production
// neon-http `db` or a test node-postgres instance.
// ============================================================================

function isoOrNull(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	const text = String(value);
	const hasZone = /[zZ]|[+-]\d{2}:?\d{2}$/.test(text);
	const parsed = new Date(hasZone ? text : `${text}Z`);
	return Number.isNaN(parsed.getTime()) ? text : parsed.toISOString();
}

function isoRequired(value: unknown): string {
	const result = isoOrNull(value);
	if (result === null) throw new Error('Expected a timestamp value in mutation result');
	return result;
}

function textOrNull(value: unknown): string | null {
	return value === null || value === undefined ? null : String(value);
}

function checkDtoFromJson(
	json: Record<string, unknown>,
	rechecks: WaterTemperatureRecheckDto[]
): WaterTemperatureCheckDto {
	const kitchenTempTenths = Number(json.kitchen_temp_tenths);
	const bathTempTenths = Number(json.bath_temp_tenths);
	return {
		id: String(json.id),
		locationId: String(json.location_id),
		houseName: String(json.house_name_snapshot),
		operationalDate: String(json.operational_date),
		shiftSlot: Number(json.shift_slot) as ShiftSlot,
		shiftId: textOrNull(json.shift_id),
		kitchenTempF: tenthsToFahrenheit(kitchenTempTenths),
		bathTempF: tenthsToFahrenheit(bathTempTenths),
		kitchenClassification: classifyFixtureReading(kitchenTempTenths),
		bathClassification: classifyFixtureReading(bathTempTenths),
		staffId: String(json.staff_id),
		staffName: String(json.staff_name_snapshot),
		staffInitials: String(json.staff_initials_snapshot),
		observedAt: isoRequired(json.observed_at),
		comments: textOrNull(json.comments),
		action: textOrNull(json.action),
		state: String(json.state) as WaterTemperatureCheckState,
		version: Number(json.version),
		voidedAt: isoOrNull(json.voided_at),
		voidedBy: textOrNull(json.voided_by),
		voidReason: textOrNull(json.void_reason),
		rechecks: rechecks.slice().sort((a, b) => a.sequence - b.sequence),
	};
}

function recheckDtoFromJson(json: Record<string, unknown>): WaterTemperatureRecheckDto {
	const tempTenths = Number(json.temp_tenths);
	return {
		id: String(json.id),
		fixture: String(json.fixture) as WaterTemperatureFixture,
		tempF: tenthsToFahrenheit(tempTenths),
		classification: classifyFixtureReading(tempTenths),
		staffId: String(json.staff_id),
		staffName: String(json.staff_name_snapshot),
		staffInitials: String(json.staff_initials_snapshot),
		measuredAt: isoRequired(json.measured_at),
		sequence: Number(json.sequence),
		supersededAt: isoOrNull(json.superseded_at),
		supersededReason: textOrNull(json.superseded_reason),
		voidedAt: isoOrNull(json.voided_at),
	};
}

// ============================================================================
// READ HELPERS (executor-parameterized; used both for pre-write validation
// with clear typed errors, and as the race-safety fallback when an atomic
// write unexpectedly returns zero rows)
// ============================================================================

async function fetchCheckJson(
	executor: WaterTemperatureExecutor,
	id: string,
	locationId: string
): Promise<Record<string, unknown> | null> {
	const rows = await run<{json: Record<string, unknown>}>(
		executor,
		sql`SELECT to_jsonb(t) AS json FROM water_temperature_checks t WHERE t.id = ${id} AND t.location_id = ${locationId} LIMIT 1`
	);
	return rows[0]?.json ?? null;
}

async function fetchCheckJsonByIdentity(
	executor: WaterTemperatureExecutor,
	id: string,
	locationId: string,
	operationalDate: string,
	shiftSlot: ShiftSlot
): Promise<Record<string, unknown> | null> {
	const rows = await run<{json: Record<string, unknown>}>(
		executor,
		sql`
			SELECT to_jsonb(t) AS json FROM water_temperature_checks t
			WHERE t.id = ${id} AND t.location_id = ${locationId}
				AND t.operational_date = ${operationalDate} AND t.shift_slot = ${shiftSlot}
			LIMIT 1
		`
	);
	return rows[0]?.json ?? null;
}

async function fetchActiveCheckJsonByIdentity(
	executor: WaterTemperatureExecutor,
	locationId: string,
	operationalDate: string,
	shiftSlot: ShiftSlot
): Promise<Record<string, unknown> | null> {
	const rows = await run<{json: Record<string, unknown>}>(
		executor,
		sql`
			SELECT to_jsonb(t) AS json FROM water_temperature_checks t
			WHERE t.location_id = ${locationId} AND t.operational_date = ${operationalDate}
				AND t.shift_slot = ${shiftSlot} AND t.voided_at IS NULL
			LIMIT 1
		`
	);
	return rows[0]?.json ?? null;
}

async function fetchRechecksJson(
	executor: WaterTemperatureExecutor,
	checkId: string
): Promise<Record<string, unknown>[]> {
	const rows = await run<{json: Record<string, unknown>}>(
		executor,
		sql`SELECT to_jsonb(t) AS json FROM water_temperature_rechecks t WHERE t.check_id = ${checkId} ORDER BY t.sequence ASC`
	);
	return rows.map((row) => row.json);
}

async function fetchCheckDto(
	executor: WaterTemperatureExecutor,
	id: string,
	locationId: string
): Promise<WaterTemperatureCheckDto | null> {
	const json = await fetchCheckJson(executor, id, locationId);
	if (!json) return null;
	const rechecksJson = await fetchRechecksJson(executor, id);
	return checkDtoFromJson(json, rechecksJson.map(recheckDtoFromJson));
}

function activeRecheckFacts(
	rechecksJson: Record<string, unknown>[],
	excludeId?: string
): WaterTemperatureRecheckFact[] {
	return rechecksJson
		.filter((row) => row.id !== excludeId && !row.superseded_at && !row.voided_at)
		.map((row) => ({
			fixture: row.fixture as WaterTemperatureFixture,
			tempTenths: Number(row.temp_tenths),
			sequence: Number(row.sequence),
		}));
}

/** Idempotent-replay detection for version-bumping writes (action, recheck,
 * supersede, correct, void): every write embeds `idempotencyKey` inside its
 * revision's after_snapshot JSON, so a retry of the caller's own already-
 * applied request can be recognized and safely replayed instead of
 * conflicting -- see R17. */
async function findRevisionReplay(
	executor: WaterTemperatureExecutor,
	checkId: string,
	locationId: string,
	version: number,
	actorId: string,
	idempotencyKey: string
): Promise<WaterTemperatureCheckDto | null> {
	const rows = await run<{found: boolean}>(
		executor,
		sql`
			SELECT true AS found
			FROM water_temperature_check_revisions r
			WHERE r.check_id = ${checkId} AND r.version = ${version} AND r.actor_id = ${actorId}
				AND (r.after_snapshot ->> 'idempotencyKey') = ${idempotencyKey}
			LIMIT 1
		`
	);
	if (rows.length === 0) return null;
	return fetchCheckDto(executor, checkId, locationId);
}

async function fetchCreateReplayJson(
	executor: WaterTemperatureExecutor,
	locationId: string,
	operationalDate: string,
	shiftSlot: ShiftSlot,
	actorId: string,
	idempotencyKey: string
): Promise<Record<string, unknown> | null> {
	const rows = await run<{json: Record<string, unknown>}>(
		executor,
		sql`
			SELECT to_jsonb(c) AS json
			FROM water_temperature_checks c
			JOIN water_temperature_check_revisions r
				ON r.check_id = c.id AND r.version = 1 AND r.action = 'create'
			WHERE c.location_id = ${locationId} AND c.operational_date = ${operationalDate}
				AND c.shift_slot = ${shiftSlot} AND c.voided_at IS NULL
				AND r.actor_id = ${actorId}
				AND (r.after_snapshot ->> 'idempotencyKey') = ${idempotencyKey}
			LIMIT 1
		`
	);
	return rows[0]?.json ?? null;
}

// ============================================================================
// CORE ATOMIC AGGREGATES
//
// Each function below performs its own pre-write validation (for clear,
// typed errors in the common sequential case) and then a single atomic
// compare-and-swap write (as the race-safety net for genuine concurrency --
// see the module doc comment above). If the atomic write unexpectedly
// returns zero rows despite the pre-check having passed, that means another
// writer won a race in between; each function then checks for an
// idempotent replay of the caller's own request before reporting a
// conflict with the current record attached for client recovery.
// ============================================================================

export async function createWaterTemperatureCheckAggregate(
	executor: WaterTemperatureExecutor,
	args: {
		locationId: string;
		houseName: string;
		operationalDate: string;
		shiftSlot: ShiftSlot;
		shiftId: string | null;
		kitchenTempTenths: number;
		bathTempTenths: number;
		staffId: string;
		staffName: string;
		staffInitials: string;
		observedAt: Date;
		comments: string | null;
		actorId: string;
		actorName: string | null;
		reason: string | null;
		idempotencyKey: string;
	}
): Promise<WaterTemperatureCheckDto> {
	const state = deriveWaterTemperatureState({
		kitchenTempTenths: args.kitchenTempTenths,
		bathTempTenths: args.bathTempTenths,
		hasAction: false,
		rechecks: [],
	});

	const rows = await run<{check_json: Record<string, unknown>}>(
		executor,
		sql`
			WITH inserted AS (
				INSERT INTO water_temperature_checks (
					location_id, house_name_snapshot, operational_date, shift_slot, shift_id,
					kitchen_temp_tenths, bath_temp_tenths, staff_id, staff_name_snapshot, staff_initials_snapshot,
					observed_at, comments, action, state, version, created_by
				) VALUES (
					${args.locationId}, ${args.houseName}, ${args.operationalDate}, ${args.shiftSlot}, ${args.shiftId},
					${args.kitchenTempTenths}, ${args.bathTempTenths}, ${args.staffId}, ${args.staffName}, ${args.staffInitials},
					${args.observedAt}, ${args.comments}, ${null}, ${state}, 1, ${args.actorId}
				)
				ON CONFLICT (location_id, operational_date, shift_slot) WHERE voided_at IS NULL DO NOTHING
				RETURNING *
			),
			inserted_revision AS (
				INSERT INTO water_temperature_check_revisions (
					check_id, version, action, before_snapshot, after_snapshot, reason, actor_id, actor_name_snapshot
				)
				SELECT id, version, 'create', NULL,
					to_jsonb(inserted) || jsonb_build_object('idempotencyKey', ${args.idempotencyKey}::text),
					${args.reason}, ${args.actorId}, ${args.actorName}
				FROM inserted
				RETURNING check_id
			)
			SELECT to_jsonb(inserted) AS check_json FROM inserted
		`
	);

	if (rows.length > 0) {
		return checkDtoFromJson(rows[0]!.check_json, []);
	}

	const replayJson = await fetchCreateReplayJson(
		executor,
		args.locationId,
		args.operationalDate,
		args.shiftSlot,
		args.actorId,
		args.idempotencyKey
	);
	if (replayJson) {
		const rechecksJson = await fetchRechecksJson(executor, String(replayJson.id));
		return checkDtoFromJson(replayJson, rechecksJson.map(recheckDtoFromJson));
	}

	const currentJson = await fetchActiveCheckJsonByIdentity(
		executor,
		args.locationId,
		args.operationalDate,
		args.shiftSlot
	);
	const current = currentJson
		? checkDtoFromJson(
				currentJson,
				(await fetchRechecksJson(executor, String(currentJson.id))).map(recheckDtoFromJson)
			)
		: null;
	throw new WaterTemperatureConflictError(
		'Another submission already completed this house/date/shift.',
		'UNIQUE_CONFLICT',
		current
	);
}

export async function recordWaterTemperatureActionAggregate(
	executor: WaterTemperatureExecutor,
	args: {
		checkId: string;
		locationId: string;
		operationalDate: string;
		shiftSlot: ShiftSlot;
		expectedVersion: number;
		action: string;
		actorId: string;
		actorName: string | null;
		idempotencyKey: string;
	}
): Promise<WaterTemperatureCheckDto> {
	const currentJson = await fetchCheckJsonByIdentity(
		executor,
		args.checkId,
		args.locationId,
		args.operationalDate,
		args.shiftSlot
	);
	if (!currentJson || currentJson.voided_at) throw new WaterTemperatureNotFoundError();
	if (currentJson.state !== 'action_required') {
		throw new WaterTemperatureConflictError(
			'This check is not currently awaiting action.',
			'STATE_CONFLICT',
			await fetchCheckDto(executor, args.checkId, args.locationId)
		);
	}
	if (Number(currentJson.version) !== args.expectedVersion) {
		throw new WaterTemperatureConflictError(
			'This check was updated by someone else. Reload and try again.',
			'VERSION_CONFLICT',
			await fetchCheckDto(executor, args.checkId, args.locationId)
		);
	}

	// Rechecks are ordinarily empty at this point (recheck append requires
	// state = 'recheck_required', which only follows this action), but a
	// privileged correction can reset state back to action_required while
	// leaving prior (now-orphaned) rechecks in place -- so this fetches the
	// real active rechecks rather than assuming an empty list.
	const activeFacts = activeRecheckFacts(await fetchRechecksJson(executor, args.checkId));
	const newState = deriveWaterTemperatureState({
		kitchenTempTenths: Number(currentJson.kitchen_temp_tenths),
		bathTempTenths: Number(currentJson.bath_temp_tenths),
		hasAction: true,
		rechecks: activeFacts,
	});

	const rows = await run<{check_json: Record<string, unknown>}>(
		executor,
		sql`
			WITH before_row AS (SELECT * FROM water_temperature_checks WHERE id = ${args.checkId}),
			updated AS (
				UPDATE water_temperature_checks
				SET action = ${args.action}, state = ${newState}, version = version + 1,
					updated_by = ${args.actorId}, updated_at = now()
				WHERE id = ${args.checkId} AND location_id = ${args.locationId}
					AND operational_date = ${args.operationalDate} AND shift_slot = ${args.shiftSlot}
					AND version = ${args.expectedVersion} AND voided_at IS NULL AND state = 'action_required'
				RETURNING *
			),
			inserted_revision AS (
				INSERT INTO water_temperature_check_revisions (
					check_id, version, action, before_snapshot, after_snapshot, reason, actor_id, actor_name_snapshot
				)
				SELECT id, version, 'action', (SELECT to_jsonb(before_row) FROM before_row),
					to_jsonb(updated) || jsonb_build_object('idempotencyKey', ${args.idempotencyKey}::text),
					NULL, ${args.actorId}, ${args.actorName}
				FROM updated
				RETURNING check_id
			)
			SELECT to_jsonb(updated) AS check_json FROM updated
		`
	);

	if (rows.length > 0) {
		const rechecksJson = await fetchRechecksJson(executor, args.checkId);
		return checkDtoFromJson(rows[0]!.check_json, rechecksJson.map(recheckDtoFromJson));
	}
	const replay = await findRevisionReplay(
		executor,
		args.checkId,
		args.locationId,
		args.expectedVersion + 1,
		args.actorId,
		args.idempotencyKey
	);
	if (replay) return replay;
	throw new WaterTemperatureConflictError(
		'This check changed before your action could be saved. Reload and try again.',
		'VERSION_CONFLICT',
		await fetchCheckDto(executor, args.checkId, args.locationId)
	);
}

export async function appendWaterTemperatureRecheckAggregate(
	executor: WaterTemperatureExecutor,
	args: {
		checkId: string;
		locationId: string;
		operationalDate: string;
		shiftSlot: ShiftSlot;
		expectedVersion: number;
		fixture: WaterTemperatureFixture;
		tempTenths: number;
		staffId: string;
		staffName: string;
		staffInitials: string;
		measuredAt: Date;
		actorId: string;
		actorName: string | null;
		idempotencyKey: string;
	}
): Promise<WaterTemperatureCheckDto> {
	const currentJson = await fetchCheckJsonByIdentity(
		executor,
		args.checkId,
		args.locationId,
		args.operationalDate,
		args.shiftSlot
	);
	if (!currentJson || currentJson.voided_at) throw new WaterTemperatureNotFoundError();
	if (currentJson.state !== 'recheck_required') {
		throw new WaterTemperatureConflictError(
			'This check is not currently awaiting a recheck.',
			'STATE_CONFLICT',
			await fetchCheckDto(executor, args.checkId, args.locationId)
		);
	}
	if (Number(currentJson.version) !== args.expectedVersion) {
		throw new WaterTemperatureConflictError(
			'This check was updated by someone else. Reload and try again.',
			'VERSION_CONFLICT',
			await fetchCheckDto(executor, args.checkId, args.locationId)
		);
	}

	const allRechecksJson = await fetchRechecksJson(executor, args.checkId);
	const existingFixtureSequences = allRechecksJson
		.filter((row) => row.fixture === args.fixture)
		.map((row) => Number(row.sequence));
	const predictedSequence = nextRecheckSequence(existingFixtureSequences);
	const newState = deriveWaterTemperatureState({
		kitchenTempTenths: Number(currentJson.kitchen_temp_tenths),
		bathTempTenths: Number(currentJson.bath_temp_tenths),
		hasAction: true,
		rechecks: [
			...activeRecheckFacts(allRechecksJson),
			{fixture: args.fixture, tempTenths: args.tempTenths, sequence: predictedSequence},
		],
	});

	const rows = await run<{check_json: Record<string, unknown>; recheck_json: Record<string, unknown>}>(
		executor,
		sql`
			WITH before_row AS (SELECT * FROM water_temperature_checks WHERE id = ${args.checkId}),
			next_seq AS (
				SELECT coalesce(max(sequence), 0) + 1 AS seq
				FROM water_temperature_rechecks
				WHERE check_id = ${args.checkId} AND fixture = ${args.fixture}
			),
			updated AS (
				UPDATE water_temperature_checks
				SET state = ${newState}, version = version + 1, updated_by = ${args.actorId}, updated_at = now()
				WHERE id = ${args.checkId} AND location_id = ${args.locationId}
					AND operational_date = ${args.operationalDate} AND shift_slot = ${args.shiftSlot}
					AND version = ${args.expectedVersion} AND voided_at IS NULL AND state = 'recheck_required'
				RETURNING *
			),
			inserted_recheck AS (
				INSERT INTO water_temperature_rechecks (
					check_id, fixture, temp_tenths, staff_id, staff_name_snapshot, staff_initials_snapshot,
					measured_at, sequence, created_by
				)
				SELECT updated.id, ${args.fixture}, ${args.tempTenths}, ${args.staffId}, ${args.staffName}, ${args.staffInitials},
					${args.measuredAt}, (SELECT seq FROM next_seq), ${args.actorId}
				FROM updated
				RETURNING *
			),
			inserted_revision AS (
				INSERT INTO water_temperature_check_revisions (
					check_id, version, action, before_snapshot, after_snapshot, reason, actor_id, actor_name_snapshot
				)
				SELECT updated.id, updated.version, 'recheck', (SELECT to_jsonb(before_row) FROM before_row),
					to_jsonb(updated) || jsonb_build_object(
						'idempotencyKey', ${args.idempotencyKey}::text,
						'recheck', to_jsonb(inserted_recheck)
					),
					NULL, ${args.actorId}, ${args.actorName}
				FROM updated JOIN inserted_recheck ON true
				RETURNING check_id
			)
			SELECT to_jsonb(updated) AS check_json, to_jsonb(inserted_recheck) AS recheck_json
			FROM updated JOIN inserted_recheck ON true
		`
	);

	if (rows.length > 0) {
		const rechecksJson = await fetchRechecksJson(executor, args.checkId);
		return checkDtoFromJson(rows[0]!.check_json, rechecksJson.map(recheckDtoFromJson));
	}
	const replay = await findRevisionReplay(
		executor,
		args.checkId,
		args.locationId,
		args.expectedVersion + 1,
		args.actorId,
		args.idempotencyKey
	);
	if (replay) return replay;
	throw new WaterTemperatureConflictError(
		'This check changed before your recheck could be saved. Reload and try again.',
		'VERSION_CONFLICT',
		await fetchCheckDto(executor, args.checkId, args.locationId)
	);
}

export async function supersedeWaterTemperatureRecheckAggregate(
	executor: WaterTemperatureExecutor,
	args: {
		checkId: string;
		locationId: string;
		recheckId: string;
		expectedVersion: number;
		reason: string;
		actorId: string;
		actorName: string | null;
		idempotencyKey: string;
	}
): Promise<WaterTemperatureCheckDto> {
	const currentJson = await fetchCheckJson(executor, args.checkId, args.locationId);
	if (!currentJson || currentJson.voided_at) throw new WaterTemperatureNotFoundError();

	const allRechecksJson = await fetchRechecksJson(executor, args.checkId);
	const target = allRechecksJson.find((row) => row.id === args.recheckId);
	if (!target) throw new WaterTemperatureNotFoundError();
	if (target.superseded_at || target.voided_at) {
		throw new WaterTemperatureConflictError(
			'This recheck has already been superseded or voided.',
			'STATE_CONFLICT',
			await fetchCheckDto(executor, args.checkId, args.locationId)
		);
	}
	if (Number(currentJson.version) !== args.expectedVersion) {
		throw new WaterTemperatureConflictError(
			'This check was updated by someone else. Reload and try again.',
			'VERSION_CONFLICT',
			await fetchCheckDto(executor, args.checkId, args.locationId)
		);
	}

	const newState = deriveWaterTemperatureState({
		kitchenTempTenths: Number(currentJson.kitchen_temp_tenths),
		bathTempTenths: Number(currentJson.bath_temp_tenths),
		hasAction: Boolean(currentJson.action && String(currentJson.action).trim().length > 0),
		rechecks: activeRecheckFacts(allRechecksJson, args.recheckId),
	});

	// Both write CTEs below independently re-check their own live precondition
	// (header version/voided state; recheck superseded/voided state). They
	// cannot race each other into a partial application: every writer that
	// could touch this recheck row also advances this same header row's
	// version through this same code path, so the header's compare-and-swap
	// is the single serialization point for the whole aggregate -- a
	// concurrent writer either commits first (and this attempt's header CAS
	// then fails on a stale version, yielding zero rows overall) or blocks
	// behind this write's row lock and re-evaluates after it commits.
	const rows = await run<{check_json: Record<string, unknown>}>(
		executor,
		sql`
			WITH before_row AS (SELECT * FROM water_temperature_checks WHERE id = ${args.checkId}),
			updated AS (
				UPDATE water_temperature_checks
				SET state = ${newState}, version = version + 1, updated_by = ${args.actorId}, updated_at = now()
				WHERE id = ${args.checkId} AND location_id = ${args.locationId}
					AND version = ${args.expectedVersion} AND voided_at IS NULL
					AND EXISTS (
						SELECT 1 FROM water_temperature_rechecks
						WHERE id = ${args.recheckId} AND check_id = ${args.checkId}
							AND superseded_at IS NULL AND voided_at IS NULL
					)
				RETURNING *
			),
			superseded_recheck AS (
				UPDATE water_temperature_rechecks
				SET superseded_at = now(), superseded_by = ${args.actorId}, superseded_reason = ${args.reason}
				WHERE id = ${args.recheckId} AND superseded_at IS NULL AND voided_at IS NULL
					AND EXISTS (SELECT 1 FROM updated)
				RETURNING *
			),
			inserted_revision AS (
				INSERT INTO water_temperature_check_revisions (
					check_id, version, action, before_snapshot, after_snapshot, reason, actor_id, actor_name_snapshot
				)
				SELECT updated.id, updated.version, 'supersede', (SELECT to_jsonb(before_row) FROM before_row),
					to_jsonb(updated) || jsonb_build_object(
						'idempotencyKey', ${args.idempotencyKey}::text,
						'supersededRecheckId', ${args.recheckId}::text
					),
					${args.reason}, ${args.actorId}, ${args.actorName}
				FROM updated JOIN superseded_recheck ON true
				RETURNING check_id
			)
			SELECT to_jsonb(updated) AS check_json FROM updated JOIN superseded_recheck ON true
		`
	);

	if (rows.length > 0) {
		const rechecksJson = await fetchRechecksJson(executor, args.checkId);
		return checkDtoFromJson(rows[0]!.check_json, rechecksJson.map(recheckDtoFromJson));
	}
	const replay = await findRevisionReplay(
		executor,
		args.checkId,
		args.locationId,
		args.expectedVersion + 1,
		args.actorId,
		args.idempotencyKey
	);
	if (replay) return replay;
	throw new WaterTemperatureConflictError(
		'This check changed before the supersede could be saved. Reload and try again.',
		'VERSION_CONFLICT',
		await fetchCheckDto(executor, args.checkId, args.locationId)
	);
}

export async function correctWaterTemperatureCheckAggregate(
	executor: WaterTemperatureExecutor,
	args: {
		checkId: string;
		locationId: string;
		expectedVersion: number;
		kitchenTempTenths: number;
		bathTempTenths: number;
		comments: string | null;
		action: string | null;
		reason: string;
		actorId: string;
		actorName: string | null;
		idempotencyKey: string;
	}
): Promise<WaterTemperatureCheckDto> {
	const currentJson = await fetchCheckJson(executor, args.checkId, args.locationId);
	if (!currentJson || currentJson.voided_at) throw new WaterTemperatureNotFoundError();
	if (Number(currentJson.version) !== args.expectedVersion) {
		throw new WaterTemperatureConflictError(
			'This check was updated by someone else. Reload and try again.',
			'VERSION_CONFLICT',
			await fetchCheckDto(executor, args.checkId, args.locationId)
		);
	}

	const allRechecksJson = await fetchRechecksJson(executor, args.checkId);
	const newState = deriveWaterTemperatureState({
		kitchenTempTenths: args.kitchenTempTenths,
		bathTempTenths: args.bathTempTenths,
		hasAction: Boolean(args.action && args.action.trim().length > 0),
		rechecks: activeRecheckFacts(allRechecksJson),
	});

	const rows = await run<{check_json: Record<string, unknown>}>(
		executor,
		sql`
			WITH before_row AS (SELECT * FROM water_temperature_checks WHERE id = ${args.checkId}),
			updated AS (
				UPDATE water_temperature_checks
				SET kitchen_temp_tenths = ${args.kitchenTempTenths}, bath_temp_tenths = ${args.bathTempTenths},
					comments = ${args.comments}, action = ${args.action}, state = ${newState},
					version = version + 1, updated_by = ${args.actorId}, updated_at = now()
				WHERE id = ${args.checkId} AND location_id = ${args.locationId}
					AND version = ${args.expectedVersion} AND voided_at IS NULL
				RETURNING *
			),
			inserted_revision AS (
				INSERT INTO water_temperature_check_revisions (
					check_id, version, action, before_snapshot, after_snapshot, reason, actor_id, actor_name_snapshot
				)
				SELECT id, version, 'correct', (SELECT to_jsonb(before_row) FROM before_row),
					to_jsonb(updated) || jsonb_build_object('idempotencyKey', ${args.idempotencyKey}::text),
					${args.reason}, ${args.actorId}, ${args.actorName}
				FROM updated
				RETURNING check_id
			)
			SELECT to_jsonb(updated) AS check_json FROM updated
		`
	);

	if (rows.length > 0) {
		const rechecksJson = await fetchRechecksJson(executor, args.checkId);
		return checkDtoFromJson(rows[0]!.check_json, rechecksJson.map(recheckDtoFromJson));
	}
	const replay = await findRevisionReplay(
		executor,
		args.checkId,
		args.locationId,
		args.expectedVersion + 1,
		args.actorId,
		args.idempotencyKey
	);
	if (replay) return replay;
	throw new WaterTemperatureConflictError(
		'This check changed before the correction could be saved. Reload and try again.',
		'VERSION_CONFLICT',
		await fetchCheckDto(executor, args.checkId, args.locationId)
	);
}

export async function voidWaterTemperatureCheckAggregate(
	executor: WaterTemperatureExecutor,
	args: {
		checkId: string;
		locationId: string;
		expectedVersion: number;
		reason: string;
		actorId: string;
		actorName: string | null;
		idempotencyKey: string;
	}
): Promise<WaterTemperatureCheckDto> {
	const currentJson = await fetchCheckJson(executor, args.checkId, args.locationId);
	if (!currentJson) throw new WaterTemperatureNotFoundError();
	if (currentJson.voided_at) {
		throw new WaterTemperatureConflictError(
			'This check has already been voided.',
			'STATE_CONFLICT',
			await fetchCheckDto(executor, args.checkId, args.locationId)
		);
	}
	if (Number(currentJson.version) !== args.expectedVersion) {
		throw new WaterTemperatureConflictError(
			'This check was updated by someone else. Reload and try again.',
			'VERSION_CONFLICT',
			await fetchCheckDto(executor, args.checkId, args.locationId)
		);
	}

	const rows = await run<{check_json: Record<string, unknown>}>(
		executor,
		sql`
			WITH before_row AS (SELECT * FROM water_temperature_checks WHERE id = ${args.checkId}),
			updated AS (
				UPDATE water_temperature_checks
				SET voided_at = now(), voided_by = ${args.actorId}, void_reason = ${args.reason},
					version = version + 1, updated_by = ${args.actorId}, updated_at = now()
				WHERE id = ${args.checkId} AND location_id = ${args.locationId}
					AND version = ${args.expectedVersion} AND voided_at IS NULL
				RETURNING *
			),
			inserted_revision AS (
				INSERT INTO water_temperature_check_revisions (
					check_id, version, action, before_snapshot, after_snapshot, reason, actor_id, actor_name_snapshot
				)
				SELECT id, version, 'void', (SELECT to_jsonb(before_row) FROM before_row),
					to_jsonb(updated) || jsonb_build_object('idempotencyKey', ${args.idempotencyKey}::text),
					${args.reason}, ${args.actorId}, ${args.actorName}
				FROM updated
				RETURNING check_id
			)
			SELECT to_jsonb(updated) AS check_json FROM updated
		`
	);

	if (rows.length > 0) {
		const rechecksJson = await fetchRechecksJson(executor, args.checkId);
		return checkDtoFromJson(rows[0]!.check_json, rechecksJson.map(recheckDtoFromJson));
	}
	const replay = await findRevisionReplay(
		executor,
		args.checkId,
		args.locationId,
		args.expectedVersion + 1,
		args.actorId,
		args.idempotencyKey
	);
	if (replay) return replay;
	throw new WaterTemperatureConflictError(
		'This check changed before the void could be saved. Reload and try again.',
		'VERSION_CONFLICT',
		await fetchCheckDto(executor, args.checkId, args.locationId)
	);
}

// ============================================================================
// ORCHESTRATION (route-facing): resolve WHO (staff snapshot / actor) and
// WHERE (active shift identity, or authorized location for privileged
// operations), then delegate to the core aggregate above against the
// production `db`. Never accepts client-supplied location/date/slot
// identity for the staff-facing operations (R16) -- identity always comes
// from the caller's own server-resolved active shift.
// ============================================================================

export async function createWaterTemperatureCheckFromShift(args: {
	clerkUserId: string;
	kitchenTempTenths: number;
	bathTempTenths: number;
	comments: string | null;
	idempotencyKey: string;
}): Promise<WaterTemperatureCheckDto> {
	const identity = await getActiveShiftIdentity(args.clerkUserId);
	if (!identity) throw new WaterTemperatureShiftRequiredError();
	const staff = await resolveStaffSnapshot(args.clerkUserId);
	return createWaterTemperatureCheckAggregate(db, {
		locationId: identity.locationId,
		houseName: identity.houseName,
		operationalDate: identity.operationalDate,
		shiftSlot: identity.shiftSlot,
		shiftId: identity.shiftId,
		kitchenTempTenths: args.kitchenTempTenths,
		bathTempTenths: args.bathTempTenths,
		staffId: staff.staffId,
		staffName: staff.staffName,
		staffInitials: staff.staffInitials,
		observedAt: new Date(),
		comments: args.comments,
		actorId: args.clerkUserId,
		actorName: staff.staffName,
		reason: null,
		idempotencyKey: args.idempotencyKey,
	});
}

export async function createWaterTemperatureCheckManual(args: {
	clerkUserId: string;
	locationId: string;
	shiftSlot: ShiftSlot;
	operationalDate: string;
	kitchenTempTenths: number;
	bathTempTenths: number;
	staffId: string;
	staffName: string;
	staffInitials: string;
	observedAt: Date;
	comments: string | null;
	reason: string;
	idempotencyKey: string;
}): Promise<WaterTemperatureCheckDto> {
	await requireAdminOrSupervisorAccess(args.clerkUserId);
	const context = await getWaterTemperatureAccessContext(args.clerkUserId);
	const location = await resolveAuthorizedWaterTemperatureLocation(context, args.locationId);
	const actor = await resolveStaffSnapshot(args.clerkUserId);
	return createWaterTemperatureCheckAggregate(db, {
		locationId: location.id,
		houseName: location.name,
		operationalDate: args.operationalDate,
		shiftSlot: args.shiftSlot,
		shiftId: null,
		kitchenTempTenths: args.kitchenTempTenths,
		bathTempTenths: args.bathTempTenths,
		staffId: args.staffId,
		staffName: args.staffName,
		staffInitials: args.staffInitials,
		observedAt: args.observedAt,
		comments: args.comments,
		actorId: args.clerkUserId,
		actorName: actor.staffName,
		reason: args.reason,
		idempotencyKey: args.idempotencyKey,
	});
}

export async function recordWaterTemperatureAction(args: {
	clerkUserId: string;
	checkId: string;
	expectedVersion: number;
	action: string;
	idempotencyKey: string;
}): Promise<WaterTemperatureCheckDto> {
	const identity = await getActiveShiftIdentity(args.clerkUserId);
	if (!identity) throw new WaterTemperatureShiftRequiredError();
	const staff = await resolveStaffSnapshot(args.clerkUserId);
	return recordWaterTemperatureActionAggregate(db, {
		checkId: args.checkId,
		locationId: identity.locationId,
		operationalDate: identity.operationalDate,
		shiftSlot: identity.shiftSlot,
		expectedVersion: args.expectedVersion,
		action: args.action,
		actorId: args.clerkUserId,
		actorName: staff.staffName,
		idempotencyKey: args.idempotencyKey,
	});
}

export async function recordWaterTemperatureRecheck(args: {
	clerkUserId: string;
	checkId: string;
	expectedVersion: number;
	fixture: WaterTemperatureFixture;
	tempTenths: number;
	measuredAt: Date;
	idempotencyKey: string;
}): Promise<WaterTemperatureCheckDto> {
	const identity = await getActiveShiftIdentity(args.clerkUserId);
	if (!identity) throw new WaterTemperatureShiftRequiredError();
	const staff = await resolveStaffSnapshot(args.clerkUserId);
	return appendWaterTemperatureRecheckAggregate(db, {
		checkId: args.checkId,
		locationId: identity.locationId,
		operationalDate: identity.operationalDate,
		shiftSlot: identity.shiftSlot,
		expectedVersion: args.expectedVersion,
		fixture: args.fixture,
		tempTenths: args.tempTenths,
		staffId: staff.staffId,
		staffName: staff.staffName,
		staffInitials: staff.staffInitials,
		measuredAt: args.measuredAt,
		actorId: args.clerkUserId,
		actorName: staff.staffName,
		idempotencyKey: args.idempotencyKey,
	});
}

export async function supersedeWaterTemperatureRecheck(args: {
	clerkUserId: string;
	checkId: string;
	recheckId: string;
	expectedVersion: number;
	reason: string;
	idempotencyKey: string;
}): Promise<WaterTemperatureCheckDto> {
	await requireAdminOrSupervisorAccess(args.clerkUserId);
	const current = await getWaterTemperatureCheck({clerkUserId: args.clerkUserId, id: args.checkId});
	const actor = await resolveStaffSnapshot(args.clerkUserId);
	return supersedeWaterTemperatureRecheckAggregate(db, {
		checkId: args.checkId,
		locationId: current.locationId,
		recheckId: args.recheckId,
		expectedVersion: args.expectedVersion,
		reason: args.reason,
		actorId: args.clerkUserId,
		actorName: actor.staffName,
		idempotencyKey: args.idempotencyKey,
	});
}

export async function correctWaterTemperatureCheck(args: {
	clerkUserId: string;
	checkId: string;
	expectedVersion: number;
	kitchenTempTenths: number;
	bathTempTenths: number;
	comments: string | null;
	action: string | null;
	reason: string;
	idempotencyKey: string;
}): Promise<WaterTemperatureCheckDto> {
	await requireAdminOrSupervisorAccess(args.clerkUserId);
	const current = await getWaterTemperatureCheck({clerkUserId: args.clerkUserId, id: args.checkId});
	const actor = await resolveStaffSnapshot(args.clerkUserId);
	return correctWaterTemperatureCheckAggregate(db, {
		checkId: args.checkId,
		locationId: current.locationId,
		expectedVersion: args.expectedVersion,
		kitchenTempTenths: args.kitchenTempTenths,
		bathTempTenths: args.bathTempTenths,
		comments: args.comments,
		action: args.action,
		reason: args.reason,
		actorId: args.clerkUserId,
		actorName: actor.staffName,
		idempotencyKey: args.idempotencyKey,
	});
}

export async function voidWaterTemperatureCheck(args: {
	clerkUserId: string;
	checkId: string;
	expectedVersion: number;
	reason: string;
	idempotencyKey: string;
}): Promise<WaterTemperatureCheckDto> {
	await requireAdminOrSupervisorAccess(args.clerkUserId);
	const current = await getWaterTemperatureCheck({clerkUserId: args.clerkUserId, id: args.checkId});
	const actor = await resolveStaffSnapshot(args.clerkUserId);
	return voidWaterTemperatureCheckAggregate(db, {
		checkId: args.checkId,
		locationId: current.locationId,
		expectedVersion: args.expectedVersion,
		reason: args.reason,
		actorId: args.clerkUserId,
		actorName: actor.staffName,
		idempotencyKey: args.idempotencyKey,
	});
}
