// Tests for the pure staff water-temperature reminder/entry model (U4).
//
// This repository has no jsdom or React Testing Library dependency and no
// component-rendering tests anywhere (see the note at the top of
// src/components/care/CareShiftWorkspace.test.tsx). Every decision the
// reminder banner, navigation badge, and entry dialog make is therefore
// expressed as a pure function in waterTemperatureEntryModel.ts and asserted
// here under node:test -- including the accessibility decisions (live-region
// role, text alternative for every colour cue, field/error association, and
// focus targets), which are values in the model rather than DOM behaviour.

import assert from 'node:assert/strict';
import test from 'node:test';

import type {
	WaterTemperatureCheckDto,
	WaterTemperatureRecheckDto,
	WaterTemperatureStatus,
} from '@/db/queries/water-temperature';
import {
	ABOVE_115_ESCALATION_INSTRUCTIONS,
	EMPTY_DRAFT_BUNDLE,
	NARRATIVE_PRIVACY_NOTICE,
	WATER_TEMPERATURE_ELEMENT_IDS,
	canOpenWaterTemperatureEntry,
	canSubmitAction,
	canSubmitInitialReadings,
	canSubmitRecheck,
	classifyTypedTemperature,
	deriveAffectedFixtures,
	deriveEntryContext,
	deriveEntryPhase,
	deriveOriginalReadingSummary,
	deriveWaterTemperatureBadge,
	deriveWaterTemperatureBanner,
	deriveWaterTemperatureSeverity,
	errorId,
	findCheckForIdentity,
	hasUnsavedWaterTemperatureEntry,
	isWaterTemperatureEntryStale,
	mapStatusFetchResult,
	mapWaterTemperatureFailure,
	newIdempotencyKey,
	parseTemperatureField,
	planDialogFocus,
	resolveCloseIntent,
	resolveClockOutDecision,
	resolveDialogKeyAction,
	sameWaterTemperatureShiftIdentity,
	selectableRecheckFixtures,
	shouldApplyStatusResponse,
	shouldPollWaterTemperatureStatus,
	shouldWarnBeforeClockOut,
	statusAfterClockOut,
	toWaterTemperatureShiftIdentity,
	validateActionDraft,
	validateInitialReadings,
	validateRecheckDraft,
	type WaterTemperatureShiftIdentity,
} from './waterTemperatureEntryModel';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const HOUSE_A = '11111111-1111-4111-8111-111111111111';
const HOUSE_B = '22222222-2222-4222-8222-222222222222';

const identityA: WaterTemperatureShiftIdentity = {
	shiftId: 'shift-a',
	locationId: HOUSE_A,
	houseName: 'House A',
	shiftSlot: 2,
	operationalDate: '2026-09-01',
};

const identityB: WaterTemperatureShiftIdentity = {
	shiftId: 'shift-b',
	locationId: HOUSE_B,
	houseName: 'House B',
	shiftSlot: 1,
	operationalDate: '2026-09-01',
};

function recheck(
	overrides: Partial<WaterTemperatureRecheckDto> = {}
): WaterTemperatureRecheckDto {
	return {
		id: 'recheck-1',
		fixture: 'kitchen',
		tempF: 114,
		classification: 'safe',
		staffId: 'staff-1',
		staffName: 'Ada Lovelace',
		staffInitials: 'AL',
		measuredAt: '2026-09-01T13:00:00.000Z',
		sequence: 1,
		supersededAt: null,
		supersededReason: null,
		voidedAt: null,
		...overrides,
	};
}

function check(overrides: Partial<WaterTemperatureCheckDto> = {}): WaterTemperatureCheckDto {
	return {
		id: 'check-1',
		locationId: HOUSE_A,
		houseName: 'House A',
		operationalDate: '2026-09-01',
		shiftSlot: 2,
		shiftId: 'shift-a',
		kitchenTempF: 112,
		bathTempF: 114,
		kitchenClassification: 'safe',
		bathClassification: 'safe',
		staffId: 'staff-1',
		staffName: 'Ada Lovelace',
		staffInitials: 'AL',
		observedAt: '2026-09-01T12:00:00.000Z',
		comments: null,
		action: null,
		state: 'complete',
		version: 1,
		voidedAt: null,
		voidedBy: null,
		voidReason: null,
		rechecks: [],
		...overrides,
	};
}

/** Kitchen 118.0F / bath 113.0F -- the AE3 scenario. */
function aboveCheck(overrides: Partial<WaterTemperatureCheckDto> = {}) {
	return check({
		kitchenTempF: 118,
		bathTempF: 113,
		kitchenClassification: 'above',
		bathClassification: 'safe',
		state: 'action_required',
		version: 1,
		...overrides,
	});
}

// ---------------------------------------------------------------------------
// Escalation copy lives in exactly one constant
// ---------------------------------------------------------------------------

test('the above-115 escalation instructions are one exported constant with the transcribed sentences', () => {
	// The transcription's final sentence came from a photographed form whose
	// edge was cut off, so the constant must remain the single point of
	// correction. These assertions pin its shape, not a paraphrase of it.
	assert.match(ABOVE_115_ESCALATION_INSTRUCTIONS, /^IF TEMPERATURE IS ABOVE 115°F:/);
	assert.match(ABOVE_115_ESCALATION_INSTRUCTIONS, /Do not allow resident use\./);
	assert.match(
		ABOVE_115_ESCALATION_INSTRUCTIONS,
		/Notify the Home Coordinator\/Supervisor immediately\./
	);
	assert.match(
		ABOVE_115_ESCALATION_INSTRUCTIONS,
		/notify the Program Manager or Director\./
	);
	assert.match(
		ABOVE_115_ESCALATION_INSTRUCTIONS,
		/Document the issue and action taken, and recheck after corrective action\./
	);
	assert.match(
		ABOVE_115_ESCALATION_INSTRUCTIONS,
		/Always use a thermometer\. Never rely on touch\.$/
	);
});

test('the narrative privacy notice warns against resident-identifying content', () => {
	assert.match(NARRATIVE_PRIVACY_NOTICE, /resident names/i);
	assert.match(NARRATIVE_PRIVACY_NOTICE, /medical details/i);
	assert.match(NARRATIVE_PRIVACY_NOTICE, /inspector and printed reports/i);
});

// ---------------------------------------------------------------------------
// Banner + badge derivation (AE1, AE11, R8, R9)
// ---------------------------------------------------------------------------

test('clock-in with a missing obligation immediately shows an amber due banner and CTA', () => {
	const banner = deriveWaterTemperatureBanner('due');
	assert.ok(banner);
	assert.equal(banner.severity, 'amber');
	assert.equal(banner.role, 'status');
	assert.equal(banner.ariaLive, 'polite');
	assert.equal(banner.showRetry, false);
	assert.equal(banner.focusOnAppear, false);
	assert.match(banner.title, /due/i);
	assert.match(banner.ctaLabel, /record/i);
	assert.equal(deriveWaterTemperatureSeverity('due'), 'amber');
	assert.deepEqual(deriveWaterTemperatureBadge('due'), {
		severity: 'amber',
		label: 'Due',
		srLabel: 'Water temperature check due for this shift',
	});
});

test('a normal save clears both the banner and the badge once the server refetch returns complete', () => {
	assert.equal(deriveWaterTemperatureBanner('complete'), null);
	assert.equal(deriveWaterTemperatureBadge('complete'), null);
	assert.equal(deriveWaterTemperatureSeverity('complete'), 'none');
});

test('a below-range completion clears the staff reminder (management still sees the flag)', () => {
	// R5/AE5: complete_with_attention does not demand the above-115 workflow
	// and must not keep nagging the worker who recorded it.
	assert.equal(deriveWaterTemperatureBanner('complete_with_attention'), null);
	assert.equal(deriveWaterTemperatureBadge('complete_with_attention'), null);
});

test('a colleague completing the shared obligation clears this worker banner on the next poll', () => {
	// AE2/AE6: the next focus/poll returns the colleague's authoritative
	// state, and the derivation for that state renders nothing.
	const afterPoll = mapStatusFetchResult({
		kind: 'response',
		httpStatus: 200,
		body: {status: 'complete'},
	});
	assert.equal(afterPoll, 'complete');
	assert.equal(deriveWaterTemperatureBanner(afterPoll), null);
	assert.equal(deriveWaterTemperatureBadge(afterPoll), null);
});

test('no_shift renders nothing at all -- a clocked-out user sees no spurious failure banner', () => {
	// U4's amendment to U3's contract: the server distinguishes "you have no
	// classified shift" (no_shift) from "we could not verify" (unknown).
	assert.equal(deriveWaterTemperatureSeverity('no_shift'), 'none');
	assert.equal(deriveWaterTemperatureBanner('no_shift'), null);
	assert.equal(deriveWaterTemperatureBadge('no_shift'), null);
});

test('unknown shows an amber unable-to-verify banner with retry and never reads as complete', () => {
	const banner = deriveWaterTemperatureBanner('unknown');
	assert.ok(banner);
	assert.equal(banner.severity, 'amber');
	assert.equal(banner.showRetry, true);
	assert.match(banner.title, /unable to verify/i);
	assert.match(banner.body, /NOT been confirmed complete/);
	assert.notEqual(deriveWaterTemperatureBadge('unknown'), null);
});

test('action_required and recheck_required are red, assertive alerts that pull focus', () => {
	for (const status of ['action_required', 'recheck_required'] as const) {
		const banner = deriveWaterTemperatureBanner(status);
		assert.ok(banner, status);
		assert.equal(banner.severity, 'red');
		assert.equal(banner.role, 'alert');
		assert.equal(banner.ariaLive, 'assertive');
		assert.equal(banner.focusOnAppear, true);
		assert.equal(deriveWaterTemperatureBadge(status)?.severity, 'red');
	}
});

test('every rendered banner and badge carries a text alternative, never colour alone', () => {
	const statuses: WaterTemperatureStatus[] = [
		'due',
		'unknown',
		'action_required',
		'recheck_required',
	];
	for (const status of statuses) {
		const banner = deriveWaterTemperatureBanner(status);
		assert.ok(banner, status);
		assert.ok(banner.iconLabel.length > 0, `${status} icon label`);
		assert.ok(banner.title.length > 0, `${status} title`);
		assert.ok(banner.ctaLabel.length > 0, `${status} cta`);
		const badge = deriveWaterTemperatureBadge(status);
		assert.ok(badge, status);
		assert.ok(badge.srLabel.length > badge.label.length, `${status} badge sr label`);
	}
});

// ---------------------------------------------------------------------------
// Status fetch mapping (R9 / AE11)
// ---------------------------------------------------------------------------

test('offline, non-200, and unrecognized status payloads all resolve to unknown', () => {
	assert.equal(mapStatusFetchResult({kind: 'failure'}), 'unknown');
	assert.equal(
		mapStatusFetchResult({kind: 'response', httpStatus: 500, body: {error: 'boom'}}),
		'unknown'
	);
	assert.equal(
		mapStatusFetchResult({kind: 'response', httpStatus: 401, body: {error: 'nope'}}),
		'unknown'
	);
	assert.equal(mapStatusFetchResult({kind: 'response', httpStatus: 200, body: null}), 'unknown');
	assert.equal(mapStatusFetchResult({kind: 'response', httpStatus: 200, body: {}}), 'unknown');
	assert.equal(
		mapStatusFetchResult({kind: 'response', httpStatus: 200, body: {status: 'finished'}}),
		'unknown'
	);
	// And unknown is never allowed to render as done.
	assert.notEqual(deriveWaterTemperatureBanner('unknown'), null);
});

test('every canonical server status round-trips through the fetch mapper', () => {
	const statuses: WaterTemperatureStatus[] = [
		'due',
		'action_required',
		'recheck_required',
		'complete',
		'complete_with_attention',
		'no_shift',
	];
	for (const status of statuses) {
		assert.equal(
			mapStatusFetchResult({kind: 'response', httpStatus: 200, body: {status}}),
			status
		);
	}
});

// ---------------------------------------------------------------------------
// Stale-response / cross-house isolation (R16, R18)
// ---------------------------------------------------------------------------

test('a status response from a superseded request generation is discarded', () => {
	assert.equal(
		shouldApplyStatusResponse({
			requestGeneration: 1,
			currentGeneration: 2,
			requestIdentity: identityA,
			currentIdentity: identityA,
		}),
		false
	);
	assert.equal(
		shouldApplyStatusResponse({
			requestGeneration: 2,
			currentGeneration: 2,
			requestIdentity: identityA,
			currentIdentity: identityA,
		}),
		true
	);
});

test('a shift or location change discards an in-flight status response for the prior house', () => {
	assert.equal(
		shouldApplyStatusResponse({
			requestGeneration: 3,
			currentGeneration: 3,
			requestIdentity: identityA,
			currentIdentity: identityB,
		}),
		false
	);
	// Clocking out mid-flight has no current identity to paint.
	assert.equal(
		shouldApplyStatusResponse({
			requestGeneration: 3,
			currentGeneration: 3,
			requestIdentity: identityA,
			currentIdentity: null,
		}),
		false
	);
});

test('the editor cannot stay open against the prior house obligation', () => {
	assert.equal(
		isWaterTemperatureEntryStale({openedForIdentity: identityA, currentIdentity: identityB}),
		true
	);
	assert.equal(
		isWaterTemperatureEntryStale({openedForIdentity: identityA, currentIdentity: null}),
		true
	);
	assert.equal(
		isWaterTemperatureEntryStale({openedForIdentity: identityA, currentIdentity: identityA}),
		false
	);
	// And it cannot be opened at all without a classified shift.
	assert.equal(canOpenWaterTemperatureEntry({identity: null, status: 'due'}), false);
	assert.equal(canOpenWaterTemperatureEntry({identity: identityA, status: 'due'}), true);
	assert.equal(canOpenWaterTemperatureEntry({identity: identityA, status: 'complete'}), false);
	assert.equal(canOpenWaterTemperatureEntry({identity: identityA, status: 'no_shift'}), false);
	assert.equal(canOpenWaterTemperatureEntry({identity: identityA, status: 'unknown'}), true);
});

test('an unclassified legacy shift yields no identity, so no banner is anchored to it', () => {
	assert.equal(toWaterTemperatureShiftIdentity(null), null);
	assert.equal(
		toWaterTemperatureShiftIdentity({
			id: 'shift-legacy',
			location: 'House A',
			locationId: null,
			shiftSlot: null,
			operationalDate: null,
			needsClassification: true,
		}),
		null
	);
	assert.deepEqual(
		toWaterTemperatureShiftIdentity({
			id: 'shift-a',
			location: 'House A',
			locationId: HOUSE_A,
			shiftSlot: 2,
			operationalDate: '2026-09-01',
			needsClassification: false,
		}),
		identityA
	);
});

test('identity comparison rejects partial matches', () => {
	assert.equal(sameWaterTemperatureShiftIdentity(identityA, identityA), true);
	assert.equal(sameWaterTemperatureShiftIdentity(identityA, identityB), false);
	assert.equal(
		sameWaterTemperatureShiftIdentity(identityA, {...identityA, shiftSlot: 3}),
		false
	);
	assert.equal(
		sameWaterTemperatureShiftIdentity(identityA, {...identityA, operationalDate: '2026-09-02'}),
		false
	);
	assert.equal(sameWaterTemperatureShiftIdentity(identityA, null), false);
});

test('polling is bounded to a visible tab with an active classified shift', () => {
	assert.equal(
		shouldPollWaterTemperatureStatus({identity: identityA, documentHidden: false}),
		true
	);
	assert.equal(
		shouldPollWaterTemperatureStatus({identity: identityA, documentHidden: true}),
		false
	);
	assert.equal(shouldPollWaterTemperatureStatus({identity: null, documentHidden: false}), false);
});

// ---------------------------------------------------------------------------
// Field parsing and submit gating (R4)
// ---------------------------------------------------------------------------

test('temperatures accept one decimal place and reject higher precision or junk', () => {
	assert.deepEqual(parseTemperatureField('112'), {ok: true, value: 112});
	assert.deepEqual(parseTemperatureField(' 112.5 '), {ok: true, value: 112.5});
	assert.deepEqual(parseTemperatureField('0'), {ok: true, value: 0});
	assert.equal(parseTemperatureField('').ok, false);
	assert.equal(parseTemperatureField('112.55').ok, false);
	assert.equal(parseTemperatureField('1e2').ok, false);
	assert.equal(parseTemperatureField('-5').ok, false);
	assert.equal(parseTemperatureField('abc').ok, false);
	assert.equal(parseTemperatureField('251').ok, false);
});

test('an unsafe typed value is classified for warning but never blocks submission', () => {
	assert.equal(classifyTypedTemperature('118.0'), 'above');
	assert.equal(classifyTypedTemperature('108'), 'below');
	assert.equal(classifyTypedTemperature('110'), 'safe');
	assert.equal(classifyTypedTemperature('115'), 'safe');
	assert.equal(classifyTypedTemperature('nope'), 'unknown');
	// The saved-even-when-unsafe rule (R6): 118/113 is a submittable draft.
	assert.equal(
		canSubmitInitialReadings({
			draft: {kitchenTempF: '118.0', bathTempF: '113.0', comments: ''},
			isSubmitting: false,
		}),
		true
	);
});

test('both readings are required, and each error is associated with its own field', () => {
	const result = validateInitialReadings({kitchenTempF: '', bathTempF: '112.55', comments: ''});
	assert.equal(result.isValid, false);
	assert.ok(result.fieldErrors.kitchenTempF);
	assert.ok(result.fieldErrors.bathTempF);
	assert.deepEqual(
		result.summary.map((issue) => issue.fieldId),
		[WATER_TEMPERATURE_ELEMENT_IDS.kitchen, WATER_TEMPERATURE_ELEMENT_IDS.bath]
	);
	assert.equal(result.values, null);
	// Each summary entry links to the field it describes, and the field's
	// error element id is derived from that same id.
	assert.equal(
		errorId(result.summary[0]!.fieldId),
		`${WATER_TEMPERATURE_ELEMENT_IDS.kitchen}-error`
	);
});

test('a valid initial draft yields exactly the numbers and normalized comments to submit', () => {
	const result = validateInitialReadings({
		kitchenTempF: '112.0',
		bathTempF: '114',
		comments: '  Ran taps for two minutes.  ',
	});
	assert.equal(result.isValid, true);
	assert.deepEqual(result.values, {
		kitchenTempF: 112,
		bathTempF: 114,
		comments: 'Ran taps for two minutes.',
	});
	assert.deepEqual(result.summary, []);
});

test('comments are bounded and reject control characters', () => {
	const tooLong = validateInitialReadings({
		kitchenTempF: '112',
		bathTempF: '114',
		comments: 'x'.repeat(2001),
	});
	assert.equal(tooLong.isValid, false);
	assert.match(tooLong.fieldErrors.comments!, /2000 characters or fewer/);

	const controlChars = validateInitialReadings({
		kitchenTempF: '112',
		bathTempF: '114',
		comments: 'bad\u0000value',
	});
	assert.equal(controlChars.isValid, false);
	assert.match(controlChars.fieldErrors.comments!, /unsupported characters/);
});

test('double-submit is disabled while a request is in flight for every panel', () => {
	const validInitial = {kitchenTempF: '112', bathTempF: '114', comments: ''};
	assert.equal(canSubmitInitialReadings({draft: validInitial, isSubmitting: false}), true);
	assert.equal(canSubmitInitialReadings({draft: validInitial, isSubmitting: true}), false);

	const validAction = {action: 'Adjusted the water heater and notified the coordinator.'};
	assert.equal(canSubmitAction({draft: validAction, isSubmitting: false}), true);
	assert.equal(canSubmitAction({draft: validAction, isSubmitting: true}), false);

	const validRecheck = {fixture: 'kitchen' as const, tempF: '114'};
	assert.equal(canSubmitRecheck({draft: validRecheck, isSubmitting: false}), true);
	assert.equal(canSubmitRecheck({draft: validRecheck, isSubmitting: true}), false);
});

test('corrective action text is required and bounded', () => {
	assert.equal(validateActionDraft({action: '   '}).isValid, false);
	assert.match(validateActionDraft({action: ''}).fieldErrors.action!, /required/i);
	assert.deepEqual(validateActionDraft({action: ''}).summary, [
		{fieldId: WATER_TEMPERATURE_ELEMENT_IDS.action, message: 'Action taken is required.'},
	]);
	assert.equal(validateActionDraft({action: 'x'.repeat(2001)}).isValid, false);
	assert.deepEqual(validateActionDraft({action: ' Adjusted the mixing valve. '}).values, {
		action: 'Adjusted the mixing valve.',
	});
});

test('a recheck requires both a fixture and a reading, each with its own field error', () => {
	const empty = validateRecheckDraft({fixture: '', tempF: ''});
	assert.equal(empty.isValid, false);
	assert.deepEqual(
		empty.summary.map((issue) => issue.fieldId),
		[
			WATER_TEMPERATURE_ELEMENT_IDS.recheckFixture,
			WATER_TEMPERATURE_ELEMENT_IDS.recheckTemp,
		]
	);
	assert.deepEqual(validateRecheckDraft({fixture: 'bath_shower', tempF: '116'}).values, {
		fixture: 'bath_shower',
		tempF: 116,
	});
});

// ---------------------------------------------------------------------------
// Above-115 lifecycle: resume after reload without losing the original (AE3/AE4)
// ---------------------------------------------------------------------------

test('an above-115 record resumes in the action panel and still shows the original reading', () => {
	const record = aboveCheck();
	assert.equal(deriveEntryPhase(record), 'action');

	const originals = deriveOriginalReadingSummary(record);
	assert.deepEqual(
		originals.map((entry) => [entry.label, entry.tempF, entry.classification]),
		[
			['Kitchen', 118, 'above'],
			['Bath / Shower', 113, 'safe'],
		]
	);
	// Out-of-range is labelled in words, not by colour alone.
	assert.match(originals[0]!.classificationLabel, /Above range/);
});

test('after action, repeated rechecks resume in the recheck panel and preserve 118.0', () => {
	// action + a 116.0 kitchen recheck: still pending.
	const pending = aboveCheck({
		state: 'recheck_required',
		action: 'Adjusted the water heater.',
		version: 3,
		rechecks: [recheck({tempF: 116, classification: 'above', sequence: 1})],
	});
	assert.equal(deriveEntryPhase(pending), 'recheck');
	const affectedPending = deriveAffectedFixtures(pending);
	assert.equal(affectedPending.length, 1);
	assert.equal(affectedPending[0]!.fixture, 'kitchen');
	assert.equal(affectedPending[0]!.originalTempF, 118);
	assert.equal(affectedPending[0]!.latestRecheckTempF, 116);
	assert.equal(affectedPending[0]!.resolved, false);
	assert.equal(selectableRecheckFixtures(pending).length, 1);

	// A later 114.0 recheck completes the slot without replacing 118.0.
	const resolved = aboveCheck({
		state: 'complete',
		action: 'Adjusted the water heater.',
		version: 4,
		rechecks: [
			recheck({id: 'r1', tempF: 116, classification: 'above', sequence: 1}),
			recheck({id: 'r2', tempF: 114, classification: 'safe', sequence: 2}),
		],
	});
	assert.equal(deriveEntryPhase(resolved), 'resolved');
	const affectedResolved = deriveAffectedFixtures(resolved);
	assert.equal(affectedResolved[0]!.originalTempF, 118, 'original observation preserved');
	assert.equal(affectedResolved[0]!.latestRecheckTempF, 114);
	assert.equal(affectedResolved[0]!.resolved, true);
	assert.equal(affectedResolved[0]!.recheckHistory.length, 2, 'ordered recheck chain kept');
	assert.deepEqual(selectableRecheckFixtures(resolved), []);
	assert.equal(deriveOriginalReadingSummary(resolved)[0]!.tempF, 118);
});

test('superseded and voided rechecks are ignored when deciding whether a fixture is resolved', () => {
	const record = aboveCheck({
		state: 'recheck_required',
		action: 'Adjusted the water heater.',
		rechecks: [
			recheck({id: 'r1', tempF: 114, classification: 'safe', sequence: 1, supersededAt: '2026-09-01T14:00:00.000Z'}),
			recheck({id: 'r2', tempF: 114, classification: 'safe', sequence: 2, voidedAt: '2026-09-01T15:00:00.000Z'}),
		],
	});
	const affected = deriveAffectedFixtures(record);
	assert.equal(affected[0]!.latestRecheckTempF, null);
	assert.equal(affected[0]!.resolved, false);
});

test('when both fixtures exceed 115, a safe recheck for one does not finish the slot', () => {
	// AE4.
	const record = aboveCheck({
		bathTempF: 119,
		bathClassification: 'above',
		state: 'recheck_required',
		action: 'Adjusted the water heater.',
		rechecks: [recheck({fixture: 'kitchen', tempF: 114, classification: 'safe', sequence: 1})],
	});
	const affected = deriveAffectedFixtures(record);
	assert.deepEqual(
		affected.map((entry) => [entry.fixture, entry.resolved]),
		[
			['kitchen', true],
			['bath_shower', false],
		]
	);
	assert.deepEqual(
		selectableRecheckFixtures(record).map((entry) => entry.fixture),
		['bath_shower']
	);
});

test('a safe or below-range check has no affected fixtures and no recheck workflow', () => {
	assert.deepEqual(deriveAffectedFixtures(check()), []);
	assert.deepEqual(
		deriveAffectedFixtures(
			check({
				kitchenTempF: 108,
				kitchenClassification: 'below',
				state: 'complete_with_attention',
			})
		),
		[]
	);
	assert.equal(deriveEntryPhase(check({state: 'complete_with_attention'})), 'resolved');
});

test('a voided record reopens the editor at the initial panel', () => {
	assert.equal(deriveEntryPhase(null), 'initial');
	assert.equal(deriveEntryPhase(check({voidedAt: '2026-09-02T00:00:00.000Z'})), 'initial');
});

test('the month listing is narrowed to exactly this shift house, date, and slot', () => {
	const mine = check();
	const otherSlot = check({id: 'check-2', shiftSlot: 3});
	const otherDate = check({id: 'check-3', operationalDate: '2026-09-02'});
	const otherHouse = check({id: 'check-4', locationId: HOUSE_B});
	const voided = check({id: 'check-5', voidedAt: '2026-09-01T20:00:00.000Z'});

	assert.equal(
		findCheckForIdentity([otherSlot, otherDate, otherHouse, mine], identityA)?.id,
		'check-1'
	);
	assert.equal(findCheckForIdentity([otherSlot, otherDate, otherHouse], identityA), null);
	assert.equal(findCheckForIdentity([voided], identityA), null);
});

// ---------------------------------------------------------------------------
// Conflict / failure mapping (R17, AE6, AE11)
// ---------------------------------------------------------------------------

test('a duplicate create becomes "another staff member completed this check", not a generic error', () => {
	const winner = check({staffInitials: 'BW', kitchenTempF: 112, bathTempF: 114});
	const failure = mapWaterTemperatureFailure({
		operation: 'create',
		httpStatus: 409,
		body: {error: 'Conflict', code: 'UNIQUE_CONFLICT', current: winner},
	});
	assert.equal(failure.kind, 'completed_by_other');
	assert.match(failure.message, /Another staff member completed this check/);
	// It uses the returned winning record rather than a generic failure.
	assert.match(failure.message, /House A — 2026-09-01, 2nd Shift/);
	assert.match(failure.message, /112\.0°F/);
	assert.match(failure.message, /recorded by BW/);
	assert.equal(failure.current?.id, 'check-1');
	assert.equal(failure.reload, true);
	assert.equal(failure.role, 'status', 'a colleague finishing the job is not an error state');
});

test('a version conflict reloads the winner and keeps the user typed values', () => {
	const winner = check({version: 5});
	const failure = mapWaterTemperatureFailure({
		operation: 'recheck',
		httpStatus: 409,
		body: {error: 'Version conflict', code: 'VERSION_CONFLICT', current: winner},
	});
	assert.equal(failure.kind, 'stale');
	assert.equal(failure.preserveDraft, true, 'never make the user retype');
	assert.equal(failure.reload, true);
	assert.equal(failure.current?.version, 5);
});

test('a NO_ACTIVE_SHIFT 409 is distinct from a duplicate conflict', () => {
	const failure = mapWaterTemperatureFailure({
		operation: 'create',
		httpStatus: 409,
		body: {error: 'An active, classified shift is required.', code: 'NO_ACTIVE_SHIFT'},
	});
	assert.equal(failure.kind, 'no_active_shift');
	assert.match(failure.message, /Clock in again/);
	assert.equal(failure.preserveDraft, true);
});

test('network ambiguity reloads the current obligation before offering retry', () => {
	const failure = mapWaterTemperatureFailure({
		operation: 'create',
		httpStatus: null,
		body: null,
	});
	assert.equal(failure.kind, 'network');
	assert.equal(failure.reload, true, 'reload the authoritative record before retrying');
	assert.equal(failure.preserveDraft, true);
	assert.match(failure.message, /could not be confirmed/i);
});

test('404, 403, 401, validation, and server failures map to distinct typed outcomes', () => {
	assert.equal(
		mapWaterTemperatureFailure({operation: 'action', httpStatus: 404, body: {error: 'Not found'}})
			.kind,
		'not_found'
	);
	assert.equal(
		mapWaterTemperatureFailure({
			operation: 'action',
			httpStatus: 403,
			body: {error: 'Access denied'},
		}).kind,
		'access_denied'
	);
	assert.equal(
		mapWaterTemperatureFailure({operation: 'create', httpStatus: 401, body: null}).kind,
		'unauthenticated'
	);
	const validation = mapWaterTemperatureFailure({
		operation: 'create',
		httpStatus: 400,
		body: {error: 'Temperature must be between 0 and 250°F'},
	});
	assert.equal(validation.kind, 'validation');
	assert.match(validation.message, /between 0 and 250/);
	assert.equal(validation.reload, false);
	assert.equal(
		mapWaterTemperatureFailure({operation: 'recheck', httpStatus: 500, body: null}).kind,
		'server'
	);
});

test('idempotency keys are prefixed and match the server key contract', () => {
	const key = newIdempotencyKey('create', () => 'abc-123-DEF');
	assert.equal(key, 'create-abc-123-DEF');
	assert.match(key, /^[A-Za-z0-9_-]+$/);
	assert.ok(newIdempotencyKey('recheck', () => 'x'.repeat(300)).length <= 100);
});

// ---------------------------------------------------------------------------
// Unsaved navigation
// ---------------------------------------------------------------------------

test('an untouched draft closes silently; a touched one asks before discarding', () => {
	assert.equal(hasUnsavedWaterTemperatureEntry(EMPTY_DRAFT_BUNDLE), false);
	assert.equal(
		resolveCloseIntent({
			draft: EMPTY_DRAFT_BUNDLE,
			isSubmitting: false,
			discardConfirmed: false,
		}),
		'close'
	);

	const touched = {
		...EMPTY_DRAFT_BUNDLE,
		initial: {kitchenTempF: '112', bathTempF: '', comments: ''},
	};
	assert.equal(hasUnsavedWaterTemperatureEntry(touched), true);
	assert.equal(
		resolveCloseIntent({draft: touched, isSubmitting: false, discardConfirmed: false}),
		'confirm-discard'
	);
	assert.equal(
		resolveCloseIntent({draft: touched, isSubmitting: false, discardConfirmed: true}),
		'close'
	);
});

test('a close request during an in-flight submit is ignored rather than abandoning the write', () => {
	assert.equal(
		resolveCloseIntent({
			draft: EMPTY_DRAFT_BUNDLE,
			isSubmitting: true,
			discardConfirmed: true,
		}),
		'ignore'
	);
});

test('unsaved detection covers the action and recheck panels too', () => {
	assert.equal(
		hasUnsavedWaterTemperatureEntry({
			...EMPTY_DRAFT_BUNDLE,
			action: {action: 'Adjusted the valve'},
		}),
		true
	);
	assert.equal(
		hasUnsavedWaterTemperatureEntry({
			...EMPTY_DRAFT_BUNDLE,
			recheck: {fixture: 'kitchen', tempF: ''},
		}),
		true
	);
});

// ---------------------------------------------------------------------------
// Clock-out (R10 / AE12)
// ---------------------------------------------------------------------------

test('clock-out warns for every unresolved status and stays silent for resolved ones', () => {
	for (const status of ['due', 'unknown', 'action_required', 'recheck_required'] as const) {
		assert.equal(shouldWarnBeforeClockOut(status), true, status);
		assert.ok(resolveClockOutDecision({status, confirmed: false}).warning, status);
	}
	for (const status of ['complete', 'complete_with_attention', 'no_shift'] as const) {
		assert.equal(shouldWarnBeforeClockOut(status), false, status);
		assert.deepEqual(resolveClockOutDecision({status, confirmed: false}), {
			proceed: true,
			requiresConfirmation: false,
			warning: null,
		});
	}
});

test('clock-out displays the warning but proceeds when confirmed -- attendance is never blocked', () => {
	const first = resolveClockOutDecision({status: 'recheck_required', confirmed: false});
	assert.equal(first.proceed, false, 'the first attempt only asks');
	assert.equal(first.requiresConfirmation, true);
	assert.match(first.warning!, /still clock out/i);

	const confirmed = resolveClockOutDecision({status: 'recheck_required', confirmed: true});
	assert.equal(confirmed.proceed, true);
	assert.match(confirmed.warning!, /visible to your supervisor/i);

	// Only the staff banner clears; the server obligation stays unresolved.
	assert.equal(statusAfterClockOut(), 'no_shift');
	assert.equal(deriveWaterTemperatureBanner(statusAfterClockOut()), null);
});

// ---------------------------------------------------------------------------
// Keyboard / assistive-technology decisions
// ---------------------------------------------------------------------------

test('focus lands on the error summary whenever one is present', () => {
	const plan = planDialogFocus({phase: 'initial', hasErrorSummary: true});
	assert.equal(plan.initialFocusId, WATER_TEMPERATURE_ELEMENT_IDS.errorSummary);
});

test('the initial panel focuses the first reading; urgent panels focus the escalation text', () => {
	assert.equal(
		planDialogFocus({phase: 'initial', hasErrorSummary: false}).initialFocusId,
		WATER_TEMPERATURE_ELEMENT_IDS.kitchen
	);
	for (const phase of ['action', 'recheck'] as const) {
		const plan = planDialogFocus({phase, hasErrorSummary: false});
		assert.equal(plan.initialFocusId, WATER_TEMPERATURE_ELEMENT_IDS.escalation, phase);
		assert.equal(plan.announceEscalation, true, phase);
	}
	assert.equal(
		planDialogFocus({phase: 'resolved', hasErrorSummary: false}).announceEscalation,
		false
	);
});

test('focus returns to the invoking CTA and is trapped inside the dialog while open', () => {
	const fromBanner = planDialogFocus({phase: 'initial', hasErrorSummary: false});
	assert.equal(fromBanner.returnFocusId, WATER_TEMPERATURE_ELEMENT_IDS.bannerCta);
	assert.equal(fromBanner.trapWithinId, WATER_TEMPERATURE_ELEMENT_IDS.dialog);

	const fromNav = planDialogFocus({
		phase: 'initial',
		hasErrorSummary: false,
		invokerId: 'nav-water-temperature',
	});
	assert.equal(fromNav.returnFocusId, 'nav-water-temperature');
});

test('Escape routes through the unsaved gate and Ctrl+Enter submits only when submittable', () => {
	const touched = {
		...EMPTY_DRAFT_BUNDLE,
		initial: {kitchenTempF: '112', bathTempF: '114', comments: ''},
	};
	assert.equal(
		resolveDialogKeyAction({
			key: 'Escape',
			draft: touched,
			isSubmitting: false,
			canSubmit: true,
		}),
		'confirm-discard'
	);
	assert.equal(
		resolveDialogKeyAction({
			key: 'Escape',
			draft: EMPTY_DRAFT_BUNDLE,
			isSubmitting: false,
			canSubmit: false,
		}),
		'close'
	);
	assert.equal(
		resolveDialogKeyAction({
			key: 'Enter',
			ctrlOrMetaKey: true,
			draft: touched,
			isSubmitting: false,
			canSubmit: true,
		}),
		'submit'
	);
	assert.equal(
		resolveDialogKeyAction({
			key: 'Enter',
			ctrlOrMetaKey: true,
			draft: touched,
			isSubmitting: true,
			canSubmit: true,
		}),
		'ignore'
	);
	assert.equal(
		resolveDialogKeyAction({
			key: 'a',
			draft: touched,
			isSubmitting: false,
			canSubmit: true,
		}),
		'ignore'
	);
});

// ---------------------------------------------------------------------------
// Read-only server context
// ---------------------------------------------------------------------------

test('house, date, slot, and initials are presented as read-only server context', () => {
	const context = deriveEntryContext({
		identity: identityA,
		check: null,
		sessionUserName: 'Ada Lovelace',
	});
	assert.deepEqual(
		{
			houseName: context.houseName,
			operationalDate: context.operationalDate,
			shiftSlotLabel: context.shiftSlotLabel,
			initials: context.initials,
		},
		{
			houseName: 'House A',
			operationalDate: '2026-09-01',
			shiftSlotLabel: '2nd Shift',
			initials: 'AL',
		}
	);
	assert.match(context.readOnlyNote, /cannot be edited/i);
});

test('an existing record supplies the authoritative snapshots over local session values', () => {
	// A replacement worker resuming a colleague's above-115 record must see
	// the record's own stored initials, not their own.
	const context = deriveEntryContext({
		identity: identityA,
		check: aboveCheck({staffInitials: 'BW'}),
		sessionUserName: 'Grace Hopper',
	});
	assert.equal(context.initials, 'BW');
});
