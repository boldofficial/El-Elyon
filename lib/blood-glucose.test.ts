import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
	DEFAULT_GLUCOSE_THRESHOLDS,
	GlucoseEntryError,
	MAX_BACKDATE_HOURS,
	buildGlucoseSchedule,
	classifyReading,
	computeRecheckDueAt,
	formatGlucoseReading,
	mgDlToMmolL,
	normalizeGlucoseEntry,
	normalizeScheduledChecks,
	resolveGlucoseThresholds,
	toMgDl,
	validateCheckedAt,
	validateGlucoseThresholds,
} from './blood-glucose';
import {deriveSlotStates} from './custom-log-schedule';

const T = DEFAULT_GLUCOSE_THRESHOLDS; // 54 / 70 / 180 / 400

const inRange = {checkType: 'before_breakfast', method: 'fingerstick', readingValue: 120};

test('converts mmol/L to whole mg/dL and back', () => {
	assert.equal(toMgDl(120, 'mg_dl'), 120);
	assert.equal(toMgDl(7.9, 'mmol_l'), 142);
	assert.equal(toMgDl(3.0, 'mmol_l'), 54);
	assert.equal(mgDlToMmolL(142), 7.9);
});

test('classifies readings against the limits, edges included in range', () => {
	assert.equal(classifyReading(53, T), 'critical_low');
	assert.equal(classifyReading(54, T), 'low');
	assert.equal(classifyReading(69, T), 'low');
	assert.equal(classifyReading(70, T), 'in_range');
	assert.equal(classifyReading(180, T), 'in_range');
	assert.equal(classifyReading(181, T), 'high');
	assert.equal(classifyReading(400, T), 'high');
	assert.equal(classifyReading(401, T), 'critical_high');
});

test('resident limits override defaults one by one', () => {
	const t = resolveGlucoseThresholds({glucoseTargetHighMgDl: 250, glucoseCriticalLowMgDl: null});
	assert.deepEqual(t, {...T, high: 250});
	assert.equal(classifyReading(220, t), 'in_range');
});

test('limits must be whole numbers in rising order', () => {
	assert.equal(validateGlucoseThresholds(T), null);
	assert.match(validateGlucoseThresholds({...T, low: 50}) ?? '', /go up in order/);
	assert.match(validateGlucoseThresholds({...T, high: 180.5}) ?? '', /whole numbers/);
	assert.match(validateGlucoseThresholds({...T, criticalHigh: 900}) ?? '', /between/);
});

test('an in-range reading needs no symptoms or actions', () => {
	const entry = normalizeGlucoseEntry(inRange, T);
	assert.equal(entry.status, 'in_range');
	assert.equal(entry.readingUnit, 'mg_dl');
	assert.equal(entry.readingMgDl, 120);
	assert.deepEqual(entry.symptoms, []);
});

test('mmol/L readings are stored as entered and classified in mg/dL', () => {
	const entry = normalizeGlucoseEntry(
		{...inRange, readingValue: 3.5, readingUnit: 'mmol_l', symptoms: ['shaky'], actionsTaken: ['juice_or_glucose']},
		T
	);
	assert.equal(entry.readingValue, 3.5);
	assert.equal(entry.readingMgDl, 63);
	assert.equal(entry.status, 'low');
});

test('an out-of-range reading requires symptoms and an action', () => {
	assert.throws(
		() => normalizeGlucoseEntry({...inRange, readingValue: 60}, T),
		/symptoms/
	);
	assert.throws(
		() => normalizeGlucoseEntry({...inRange, readingValue: 60, symptoms: ['none']}, T),
		/what was done/
	);
	const ok = normalizeGlucoseEntry(
		{...inRange, readingValue: 60, symptoms: ['none'], actionsTaken: ['juice_or_glucose']},
		T
	);
	assert.equal(ok.status, 'low');
	// Recording insulin counts as the action for a high.
	const high = normalizeGlucoseEntry(
		{...inRange, readingValue: 260, symptoms: ['none'], insulinGiven: true, insulinType: 'Lispro', insulinUnits: 2},
		T
	);
	assert.equal(high.status, 'high');
	assert.deepEqual(high.actionsTaken, []);
});

test('notifying someone requires their name; "other" requires notes', () => {
	const base = {...inRange, readingValue: 450, symptoms: ['very_thirsty']};
	assert.throws(
		() => normalizeGlucoseEntry({...base, actionsTaken: ['nurse_notified']}, T),
		/name of the person/
	);
	assert.throws(
		() => normalizeGlucoseEntry({...base, actionsTaken: ['other']}, T),
		/notes/
	);
	const ok = normalizeGlucoseEntry(
		{...base, actionsTaken: ['nurse_notified'], notifiedWho: 'Nurse Ada'},
		T
	);
	assert.equal(ok.status, 'critical_high');
	assert.equal(ok.notifiedWho, 'Nurse Ada');
});

test('"None" cannot be combined with other symptoms; lists keep canonical order', () => {
	assert.throws(
		() => normalizeGlucoseEntry({...inRange, symptoms: ['none', 'shaky']}, T),
		/None/
	);
	const entry = normalizeGlucoseEntry({...inRange, symptoms: ['dizzy', 'shaky', 'dizzy']}, T);
	assert.deepEqual(entry.symptoms, ['shaky', 'dizzy']);
	assert.throws(() => normalizeGlucoseEntry({...inRange, symptoms: ['sleepy']}, T), GlucoseEntryError);
});

test('a refused check needs a reason and stores no reading', () => {
	assert.throws(
		() => normalizeGlucoseEntry({checkType: 'bedtime', method: 'fingerstick', refused: true}, T),
		/why/
	);
	const entry = normalizeGlucoseEntry(
		{checkType: 'bedtime', method: 'fingerstick', refused: true, refusalReason: 'Asleep', readingValue: 99},
		T
	);
	assert.equal(entry.status, 'refused');
	assert.equal(entry.readingValue, null);
	assert.equal(entry.readingMgDl, null);
});

test('reading bounds and precision are enforced per unit', () => {
	assert.throws(() => normalizeGlucoseEntry({...inRange, readingValue: undefined}, T), /Enter the reading/);
	assert.throws(() => normalizeGlucoseEntry({...inRange, readingValue: 5}, T), /between/);
	assert.throws(() => normalizeGlucoseEntry({...inRange, readingValue: 120.5}, T), /whole/);
	assert.throws(
		() => normalizeGlucoseEntry({...inRange, readingValue: 7.25, readingUnit: 'mmol_l'}, T),
		/one decimal/
	);
	assert.throws(() => normalizeGlucoseEntry({...inRange, readingUnit: 'mg'}, T), /Unknown unit/);
	assert.equal(normalizeGlucoseEntry({...inRange, readingValue: '125'}, T).readingMgDl, 125);
});

test('insulin needs a name and a dose in half units', () => {
	assert.throws(
		() => normalizeGlucoseEntry({...inRange, insulinGiven: true, insulinUnits: 4}, T),
		/insulin name/
	);
	assert.throws(
		() => normalizeGlucoseEntry({...inRange, insulinGiven: true, insulinType: 'Lispro', insulinUnits: 4.3}, T),
		/half units/
	);
	const entry = normalizeGlucoseEntry(
		{...inRange, insulinGiven: true, insulinType: 'Lispro', insulinUnits: 4.5},
		T
	);
	assert.equal(entry.insulinUnits, 4.5);
	// Dose fields are dropped when insulin was not given.
	const none = normalizeGlucoseEntry({...inRange, insulinType: 'Lispro', insulinUnits: 4}, T);
	assert.equal(none.insulinType, null);
	assert.equal(none.insulinUnits, null);
});

test('rechecks are due 15 minutes after a low and 60 after a high', () => {
	const at = new Date('2026-10-15T12:00:00Z');
	assert.equal(computeRecheckDueAt(at, 'low')?.toISOString(), '2026-10-15T12:15:00.000Z');
	assert.equal(computeRecheckDueAt(at, 'critical_high')?.toISOString(), '2026-10-15T13:00:00.000Z');
	assert.equal(computeRecheckDueAt(at, 'in_range'), null);
	assert.equal(computeRecheckDueAt(at, 'refused'), null);
});

test('check time defaults to now and cannot be in the future or too old', () => {
	const now = new Date('2026-10-15T12:00:00Z');
	assert.equal(validateCheckedAt(undefined, now), now);
	assert.equal(
		validateCheckedAt('2026-10-15T11:30:00Z', now).toISOString(),
		'2026-10-15T11:30:00.000Z'
	);
	assert.throws(() => validateCheckedAt('2026-10-15T12:30:00Z', now), /future/);
	const tooOld = new Date(now.getTime() - (MAX_BACKDATE_HOURS + 1) * 3_600_000).toISOString();
	assert.throws(() => validateCheckedAt(tooOld, now), /hours/);
	assert.throws(() => validateCheckedAt('yesterday', now), /Invalid/);
});

test('scheduled checks are filtered to known types and drive slot states', () => {
	assert.deepEqual(
		normalizeScheduledChecks(['bedtime', 'prn', 'before_breakfast', 'bedtime', 3]),
		['before_breakfast', 'bedtime']
	);
	const schedule = buildGlucoseSchedule(['before_breakfast', 'bedtime']);
	const states = deriveSlotStates({
		schedule,
		loggedSlotKeys: new Set(['before_breakfast']),
		now: '21:00',
	});
	assert.deepEqual(
		states.map((s) => `${s.slot.key}:${s.status}`),
		['before_breakfast:logged', 'bedtime:open']
	);
});

test('formats readings in the unit they were entered', () => {
	assert.equal(formatGlucoseReading({refused: false, readingValue: 142, readingUnit: 'mg_dl'}), '142 mg/dL');
	assert.equal(formatGlucoseReading({refused: false, readingValue: 8, readingUnit: 'mmol_l'}), '8.0 mmol/L');
	assert.equal(formatGlucoseReading({refused: true, readingValue: null, readingUnit: 'mg_dl'}), 'Refused');
});
