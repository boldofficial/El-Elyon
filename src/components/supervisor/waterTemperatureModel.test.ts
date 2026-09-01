// Tests for the pure monthly water-temperature management model (U5).
//
// This repository has no jsdom or React Testing Library and no
// component-rendering tests, so the calendar projection, the colour-
// independent status markers, the privileged-write validation, and the
// stale-conflict recovery are all asserted here as values.

import assert from 'node:assert/strict';
import test from 'node:test';

import type {
	WaterTemperatureCheckDto,
	WaterTemperatureRecheckDto,
} from '@/db/queries/water-temperature';
import type {ShiftSlot, WaterTemperatureCheckState} from '@/lib/water-temperature';
import {
	MANUAL_ENTRY_STAFF_ID,
	WATER_TEMPERATURE_CELL_MARKERS,
	WATER_TEMPERATURE_ROW_COUNT,
	WATER_TEMPERATURE_WORKSPACE_IDS,
	buildWaterTemperatureMonth,
	correctionDraftFromCheck,
	daysInMonth,
	describeCell,
	emptyManualEntryDraft,
	isWaterTemperatureScopeReady,
	mapWorkspaceMutationFailure,
	ordinalDayLabel,
	partitionMonthRecords,
	sameWaterTemperatureScope,
	unresolvedFixturesFor,
	validateCorrectionDraft,
	validateManualEntryDraft,
	validateVoidDraft,
	voidWouldReopenObligation,
} from './waterTemperatureModel';

// ---------------------------------------------------------------------------
// fixtures
// ---------------------------------------------------------------------------

function recheck(
	overrides: Partial<WaterTemperatureRecheckDto> & {sequence: number}
): WaterTemperatureRecheckDto {
	return {
		id: `recheck-${overrides.sequence}`,
		fixture: 'kitchen',
		tempF: 114,
		classification: 'safe',
		staffId: 'staff-2',
		staffName: 'Alex Brown',
		staffInitials: 'AB',
		measuredAt: '2026-01-05T18:00:00.000Z',
		supersededAt: null,
		supersededReason: null,
		voidedAt: null,
		...overrides,
	};
}

function dto(
	overrides: Partial<WaterTemperatureCheckDto> & {operationalDate: string; shiftSlot: ShiftSlot}
): WaterTemperatureCheckDto {
	return {
		id: `check-${overrides.operationalDate}-${overrides.shiftSlot}`,
		locationId: 'loc-1',
		houseName: 'Cedar House',
		shiftId: 'shift-1',
		kitchenTempF: 112,
		bathTempF: 114,
		kitchenClassification: 'safe',
		bathClassification: 'safe',
		staffId: 'staff-1',
		staffName: 'Morgan Smith',
		staffInitials: 'MS',
		observedAt: '2026-01-05T14:00:00.000Z',
		comments: null,
		action: null,
		state: 'complete' as WaterTemperatureCheckState,
		version: 1,
		voidedAt: null,
		voidedBy: null,
		voidReason: null,
		rechecks: [],
		...overrides,
	};
}

const TODAY = '2026-01-31';

// ---------------------------------------------------------------------------
// calendar boundaries (AE9 / R14)
// ---------------------------------------------------------------------------

test('January renders 31 valid rows with no N/A cells', () => {
	const view = buildWaterTemperatureMonth({
		year: 2026,
		month: 1,
		records: [],
		todayLocalDate: TODAY,
	});

	assert.equal(view.rows.length, WATER_TEMPERATURE_ROW_COUNT);
	assert.equal(view.monthLabel, 'January 2026');
	assert.equal(view.summary.validDays, 31);
	assert.equal(view.summary.naDays, 0);
	assert.equal(view.summary.naCells, 0);
	assert.equal(view.summary.obligationCount, 93);
	assert.equal(view.summary.missing, 93);
	for (const row of view.rows) {
		assert.equal(row.existsInMonth, true);
		assert.equal(row.cells.length, 3);
		assert.deepEqual(
			row.cells.map((cell) => cell.slot),
			[1, 2, 3]
		);
	}
	assert.deepEqual(
		view.rows.map((row) => row.dayLabel).slice(0, 4),
		['1st', '2nd', '3rd', '4th']
	);
	assert.equal(view.rows[30]!.dayLabel, '31st');
	assert.equal(ordinalDayLabel(11), '11th');
	assert.equal(ordinalDayLabel(12), '12th');
	assert.equal(ordinalDayLabel(13), '13th');
	assert.equal(ordinalDayLabel(21), '21st');
	assert.equal(ordinalDayLabel(22), '22nd');
	assert.equal(ordinalDayLabel(23), '23rd');
});

test('February 2028 renders 29 valid rows and marks 30 and 31 N/A', () => {
	assert.equal(daysInMonth(2028, 2), 29);
	const view = buildWaterTemperatureMonth({
		year: 2028,
		month: 2,
		records: [],
		todayLocalDate: '2028-02-29',
	});

	assert.equal(view.rows.length, 31);
	assert.equal(view.summary.validDays, 29);
	assert.equal(view.summary.naDays, 2);
	assert.equal(view.summary.naCells, 6);
	assert.equal(view.summary.obligationCount, 87);
	// A nonexistent date is never counted as a missing obligation (AE9).
	assert.equal(view.summary.missing, 87);

	for (const index of [29, 30]) {
		const row = view.rows[index]!;
		assert.equal(row.existsInMonth, false);
		assert.equal(row.date, null);
		for (const cell of row.cells) {
			assert.equal(cell.status, 'na');
			assert.equal(cell.marker.symbol, 'N/A');
			assert.equal(cell.canRecordManualEntry, false);
		}
	}
	assert.equal(view.rows[28]!.existsInMonth, true);
	assert.equal(view.rows[28]!.date, '2028-02-29');
});

test('February 2027 marks rows 29 through 31 N/A', () => {
	assert.equal(daysInMonth(2027, 2), 28);
	const view = buildWaterTemperatureMonth({
		year: 2027,
		month: 2,
		records: [],
		todayLocalDate: '2027-03-15',
	});

	assert.equal(view.summary.validDays, 28);
	assert.equal(view.summary.naDays, 3);
	for (const index of [28, 29, 30]) {
		assert.ok(view.rows[index]!.cells.every((cell) => cell.status === 'na'));
	}
	assert.equal(view.rows[27]!.cells.every((cell) => cell.status === 'missing'), true);
});

test('future days are blank but not delinquent', () => {
	const view = buildWaterTemperatureMonth({
		year: 2026,
		month: 1,
		records: [],
		todayLocalDate: '2026-01-10',
	});

	assert.equal(view.rows[9]!.isFuture, false);
	assert.ok(view.rows[9]!.cells.every((cell) => cell.status === 'missing'));
	assert.equal(view.rows[10]!.isFuture, true);
	assert.ok(view.rows[10]!.cells.every((cell) => cell.status === 'future'));
	assert.equal(view.summary.missing, 30);
	assert.equal(view.summary.future, 63);
	// Only an elapsed, valid, unrecorded day offers a manual backfill.
	assert.equal(view.rows[10]!.cells[0]!.canRecordManualEntry, false);
	assert.equal(view.rows[9]!.cells[0]!.canRecordManualEntry, true);
});

// ---------------------------------------------------------------------------
// status distinguishability without colour
// ---------------------------------------------------------------------------

test('every cell status carries a distinct symbol and word, not colour alone', () => {
	const markers = Object.values(WATER_TEMPERATURE_CELL_MARKERS);
	assert.equal(markers.length, 7);
	assert.equal(new Set(markers.map((marker) => marker.symbol)).size, 7);
	assert.equal(new Set(markers.map((marker) => marker.label)).size, 7);
	for (const marker of markers) {
		assert.ok(marker.symbol.trim().length > 0);
		assert.ok(marker.label.trim().length > 0);
	}
	// Tones repeat (two urgent states share one colour), which is exactly why
	// the symbol and label must not.
	assert.ok(new Set(markers.map((marker) => marker.tone)).size < markers.length);
});

test('missing, complete, below-range, action-required and recheck-required cells stay distinguishable', () => {
	const view = buildWaterTemperatureMonth({
		year: 2026,
		month: 1,
		todayLocalDate: TODAY,
		records: [
			dto({operationalDate: '2026-01-02', shiftSlot: 1, state: 'complete'}),
			dto({
				operationalDate: '2026-01-02',
				shiftSlot: 2,
				state: 'complete_with_attention',
				kitchenTempF: 108,
				kitchenClassification: 'below',
			}),
			dto({
				operationalDate: '2026-01-03',
				shiftSlot: 1,
				state: 'action_required',
				kitchenTempF: 118,
				kitchenClassification: 'above',
			}),
			dto({
				operationalDate: '2026-01-03',
				shiftSlot: 2,
				state: 'recheck_required',
				kitchenTempF: 118,
				kitchenClassification: 'above',
				action: 'Adjusted the mixing valve',
				rechecks: [recheck({sequence: 1, tempF: 116, classification: 'above'})],
			}),
		],
	});

	const statuses = [
		view.rows[1]!.cells[0]!,
		view.rows[1]!.cells[1]!,
		view.rows[1]!.cells[2]!,
		view.rows[2]!.cells[0]!,
		view.rows[2]!.cells[1]!,
	];
	assert.deepEqual(
		statuses.map((cell) => cell.status),
		['complete', 'complete_with_attention', 'missing', 'action_required', 'recheck_required']
	);
	assert.equal(new Set(statuses.map((cell) => cell.marker.symbol)).size, 5);
	assert.equal(new Set(statuses.map((cell) => cell.marker.label)).size, 5);

	assert.equal(view.rows[1]!.cells[1]!.belowRange, true);
	assert.equal(view.rows[2]!.cells[0]!.aboveRange, true);
	assert.deepEqual(view.rows[2]!.cells[0]!.unresolvedFixtures, ['kitchen']);
	assert.deepEqual(view.rows[2]!.cells[1]!.unresolvedFixtures, ['kitchen']);
	assert.equal(view.summary.unresolved, 2);
	assert.equal(view.summary.complete, 1);
	assert.equal(view.summary.completeWithAttention, 1);
	assert.equal(view.summary.actionRequired, 1);
	assert.equal(view.summary.recheckRequired, 1);

	assert.match(describeCell(view.rows[1]!.cells[2]!), /missing/);
	assert.match(describeCell(view.rows[2]!.cells[1]!), /Recheck required/);
	assert.match(describeCell(view.rows[2]!.cells[1]!), /unresolved: Kitchen/);
	assert.match(describeCell(view.rows[1]!.cells[0]!), /initials MS/);
});

// ---------------------------------------------------------------------------
// original readings are never replaced (R7 / AE3)
// ---------------------------------------------------------------------------

test('a resolved above-115 cell still shows the original unsafe reading', () => {
	const check = dto({
		operationalDate: '2026-01-06',
		shiftSlot: 3,
		kitchenTempF: 118,
		kitchenClassification: 'above',
		bathTempF: 113,
		state: 'complete',
		action: 'Lowered set point',
		rechecks: [
			recheck({sequence: 1, tempF: 116, classification: 'above'}),
			recheck({sequence: 2, tempF: 114, classification: 'safe'}),
		],
	});
	const view = buildWaterTemperatureMonth({
		year: 2026,
		month: 1,
		records: [check],
		todayLocalDate: TODAY,
	});
	const cell = view.rows[5]!.cells[2]!;

	assert.equal(cell.status, 'complete');
	assert.equal(cell.kitchenTempF, 118);
	assert.equal(cell.bathTempF, 113);
	assert.deepEqual(cell.unresolvedFixtures, []);
	assert.deepEqual(
		cell.activeRechecks.map((entry) => entry.tempF),
		[116, 114]
	);
	assert.deepEqual(cell.supersededRechecks, []);
	assert.equal(view.summary.unresolved, 0);
});

test('a superseded recheck is kept in history and ignored by the resolution check', () => {
	const check = dto({
		operationalDate: '2026-01-07',
		shiftSlot: 1,
		kitchenTempF: 118,
		kitchenClassification: 'above',
		state: 'recheck_required',
		action: 'Flushed the line',
		rechecks: [
			recheck({
				sequence: 1,
				tempF: 114,
				classification: 'safe',
				supersededAt: '2026-01-08T00:00:00.000Z',
				supersededReason: 'Mistyped',
			}),
			recheck({sequence: 2, tempF: 117, classification: 'above'}),
		],
	});

	assert.deepEqual(unresolvedFixturesFor(check), ['kitchen']);
	const view = buildWaterTemperatureMonth({
		year: 2026,
		month: 1,
		records: [check],
		todayLocalDate: TODAY,
	});
	const cell = view.rows[6]!.cells[0]!;
	assert.deepEqual(
		cell.activeRechecks.map((entry) => entry.tempF),
		[117]
	);
	assert.deepEqual(
		cell.supersededRechecks.map((entry) => entry.tempF),
		[114]
	);
});

// ---------------------------------------------------------------------------
// void reopens the obligation while retaining history (AE7)
// ---------------------------------------------------------------------------

test('a voided record leaves the cell missing and keeps its history', () => {
	const voided = dto({
		operationalDate: '2026-01-09',
		shiftSlot: 2,
		voidedAt: '2026-01-10T12:00:00.000Z',
		voidedBy: 'supervisor-1',
		voidReason: 'Recorded against the wrong house',
		version: 2,
	});
	const {active, voided: voidedRecords} = partitionMonthRecords([voided]);
	assert.equal(active.length, 0);
	assert.equal(voidedRecords.length, 1);

	const view = buildWaterTemperatureMonth({
		year: 2026,
		month: 1,
		records: [voided],
		todayLocalDate: TODAY,
	});
	const cell = view.rows[8]!.cells[1]!;

	assert.equal(cell.status, 'missing');
	assert.equal(cell.check, null);
	// The obligation is reopened, which is what makes a matching active staff
	// reminder return.
	assert.equal(cell.canRecordManualEntry, true);
	assert.equal(voidWouldReopenObligation(cell), false);
	assert.equal(cell.voidedHistory.length, 1);
	assert.equal(cell.voidedHistory[0]!.voidReason, 'Recorded against the wrong house');
	assert.equal(view.summary.voidedRecords, 1);

	// A replacement record for the same identity coexists with the history.
	const replaced = buildWaterTemperatureMonth({
		year: 2026,
		month: 1,
		records: [voided, dto({operationalDate: '2026-01-09', shiftSlot: 2, id: 'replacement'})],
		todayLocalDate: TODAY,
	});
	const replacedCell = replaced.rows[8]!.cells[1]!;
	assert.equal(replacedCell.status, 'complete');
	assert.equal(replacedCell.check?.id, 'replacement');
	assert.equal(replacedCell.voidedHistory.length, 1);
	assert.equal(voidWouldReopenObligation(replacedCell), true);
});

// ---------------------------------------------------------------------------
// privileged writes require a reason and the current version (R11 / AE7)
// ---------------------------------------------------------------------------

test('a correction without a reason or a known version is refused', () => {
	const check = dto({operationalDate: '2026-01-11', shiftSlot: 1, kitchenTempF: 118, version: 4});
	const draft = correctionDraftFromCheck(check);
	assert.equal(draft.kitchenTempF, '118.0');
	assert.equal(draft.reason, '');

	const missingReason = validateCorrectionDraft({draft, expectedVersion: 4});
	assert.equal(missingReason.isValid, false);
	assert.equal(missingReason.values, null);
	assert.deepEqual(
		missingReason.summary.map((issue) => issue.fieldId),
		[WATER_TEMPERATURE_WORKSPACE_IDS.reason]
	);

	const missingVersion = validateCorrectionDraft({
		draft: {...draft, reason: 'Transcription error on the paper log'},
		expectedVersion: null,
	});
	assert.equal(missingVersion.isValid, false);
	assert.match(missingVersion.summary[0]!.message, /version is unavailable/);

	const valid = validateCorrectionDraft({
		draft: {...draft, kitchenTempF: '113.5', reason: 'Transcription error on the paper log'},
		expectedVersion: 4,
	});
	assert.equal(valid.isValid, true);
	assert.deepEqual(valid.values, {
		expectedVersion: 4,
		kitchenTempF: 113.5,
		bathTempF: 114,
		comments: null,
		action: null,
		reason: 'Transcription error on the paper log',
	});
});

test('a correction rejects unparseable temperatures and over-long narratives', () => {
	const base = {kitchenTempF: '112.0', bathTempF: '114.0', comments: '', action: '', reason: 'ok'};

	assert.equal(
		validateCorrectionDraft({draft: {...base, kitchenTempF: '112.55'}, expectedVersion: 1}).isValid,
		false
	);
	assert.equal(
		validateCorrectionDraft({draft: {...base, bathTempF: 'abc'}, expectedVersion: 1}).isValid,
		false
	);
	const controlChars = validateCorrectionDraft({
		draft: {...base, comments: `bad${String.fromCharCode(0)}value`},
		expectedVersion: 1,
	});
	assert.equal(controlChars.isValid, false);
	assert.match(controlChars.summary[0]!.message, /unsupported characters/);
	assert.equal(
		validateCorrectionDraft({draft: {...base, action: 'a'.repeat(2001)}, expectedVersion: 1}).isValid,
		false
	);
});

test('a manual missing-slot entry requires a reason, an observer, and an in-day observation time', () => {
	const draft = emptyManualEntryDraft('2026-01-12');
	assert.equal(draft.observedAt, '2026-01-12T08:00');

	const empty = validateManualEntryDraft({
		draft,
		locationId: 'loc-1',
		operationalDate: '2026-01-12',
		shiftSlot: 2,
	});
	assert.equal(empty.isValid, false);
	assert.deepEqual(
		empty.summary.map((issue) => issue.fieldId),
		[
			WATER_TEMPERATURE_WORKSPACE_IDS.kitchen,
			WATER_TEMPERATURE_WORKSPACE_IDS.bath,
			WATER_TEMPERATURE_WORKSPACE_IDS.staffName,
			WATER_TEMPERATURE_WORKSPACE_IDS.staffInitials,
			WATER_TEMPERATURE_WORKSPACE_IDS.reason,
		]
	);

	const wrongDay = validateManualEntryDraft({
		draft: {
			...draft,
			kitchenTempF: '112',
			bathTempF: '114',
			staffName: 'Jordan Lee',
			staffInitials: 'JL',
			reason: 'Backfilled from the paper log',
			observedAt: '2026-01-13T08:00',
		},
		locationId: 'loc-1',
		operationalDate: '2026-01-12',
		shiftSlot: 2,
	});
	assert.equal(wrongDay.isValid, false);
	assert.match(
		wrongDay.summary.map((issue) => issue.message).join(' '),
		/must fall on 2026-01-12/
	);

	const valid = validateManualEntryDraft({
		draft: {
			...draft,
			kitchenTempF: '112',
			bathTempF: '114',
			staffName: 'Jordan Lee',
			staffInitials: 'JL',
			reason: 'Backfilled from the paper log',
		},
		locationId: 'loc-1',
		operationalDate: '2026-01-12',
		shiftSlot: 2,
	});
	assert.equal(valid.isValid, true);
	assert.equal(valid.values?.staffId, MANUAL_ENTRY_STAFF_ID);
	assert.equal(valid.values?.operationalDate, '2026-01-12');
	assert.equal(valid.values?.shiftSlot, 2);
	assert.equal(valid.values?.locationId, 'loc-1');
	assert.equal(valid.values?.reason, 'Backfilled from the paper log');
	assert.ok(valid.values?.observedAt.endsWith('Z'));
});

test('a void requires a reason and the current version', () => {
	assert.equal(validateVoidDraft({draft: {reason: '   '}, expectedVersion: 3}).isValid, false);
	assert.equal(validateVoidDraft({draft: {reason: 'Duplicate'}, expectedVersion: null}).isValid, false);
	const valid = validateVoidDraft({draft: {reason: 'Duplicate entry'}, expectedVersion: 3});
	assert.equal(valid.isValid, true);
	assert.deepEqual(valid.values, {expectedVersion: 3, reason: 'Duplicate entry'});
});

// ---------------------------------------------------------------------------
// scope readiness + conflict recovery (R17 / R18)
// ---------------------------------------------------------------------------

test('records are only ready when the loaded scope still matches the selection', () => {
	const scope = {locationId: 'loc-1', year: 2026, month: 1};
	assert.equal(sameWaterTemperatureScope(scope, {...scope}), true);
	assert.equal(sameWaterTemperatureScope(scope, {...scope, month: 2}), false);
	assert.equal(sameWaterTemperatureScope(scope, null), false);

	assert.equal(
		isWaterTemperatureScopeReady({currentScope: scope, loadedScope: scope, recordsState: 'ready'}),
		true
	);
	assert.equal(
		isWaterTemperatureScopeReady({
			currentScope: {...scope, locationId: 'loc-2'},
			loadedScope: scope,
			recordsState: 'ready',
		}),
		false
	);
	assert.equal(
		isWaterTemperatureScopeReady({currentScope: scope, loadedScope: scope, recordsState: 'loading'}),
		false
	);
});

test('a stale correction reloads the current record and keeps the operator’s values', () => {
	const current = dto({operationalDate: '2026-01-14', shiftSlot: 1, version: 7});
	const stale = mapWorkspaceMutationFailure({
		operation: 'correct',
		httpStatus: 409,
		body: {error: 'Version conflict', code: 'VERSION_CONFLICT', current},
	});

	assert.equal(stale.kind, 'stale');
	assert.equal(stale.reload, true);
	assert.equal(stale.preserveDraft, true);
	assert.equal(stale.current?.version, 7);
	assert.equal(stale.role, 'alert');
	assert.match(stale.message, /reloaded/);

	const duplicate = mapWorkspaceMutationFailure({
		operation: 'manual-create',
		httpStatus: 409,
		body: {error: 'Unique conflict', code: 'UNIQUE_CONFLICT'},
	});
	assert.match(duplicate.message, /Another record now exists/);
	assert.equal(duplicate.reload, true);
});

test('every other failure mode is typed and never silently succeeds', () => {
	const cases = [
		{httpStatus: null, kind: 'network', reload: true},
		{httpStatus: 404, kind: 'not_found', reload: true},
		{httpStatus: 403, kind: 'access_denied', reload: true},
		{httpStatus: 401, kind: 'unauthenticated', reload: false},
		{httpStatus: 400, kind: 'validation', reload: false},
		{httpStatus: 500, kind: 'server', reload: true},
	] as const;

	for (const expected of cases) {
		const outcome = mapWorkspaceMutationFailure({
			operation: 'void',
			httpStatus: expected.httpStatus,
			body: {error: 'Boom'},
		});
		assert.equal(outcome.kind, expected.kind);
		assert.equal(outcome.reload, expected.reload);
		assert.equal(outcome.preserveDraft, true);
		assert.ok(outcome.message.length > 0);
	}

	assert.equal(
		mapWorkspaceMutationFailure({operation: 'void', httpStatus: 400, body: {error: 'Reason too long'}})
			.message,
		'Reason too long'
	);
});
