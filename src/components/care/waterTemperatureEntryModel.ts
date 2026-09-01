// src/components/care/waterTemperatureEntryModel.ts
//
// Pure, framework-free decision logic for the staff water-temperature
// reminder and entry workflow (U4). Everything a test needs to assert --
// banner/badge derivation, submit gating, field validation and error
// association, conflict-message mapping, stale-response guarding, unsaved
// navigation, clock-out warnings, and the derived aria/role/focus decisions
// -- lives here rather than inside the React components, because this
// repository has no jsdom/React Testing Library and no component-rendering
// tests anywhere (see src/components/care/CareShiftWorkspace.test.tsx and
// src/components/supervisor/lifeSafetyInspectionWorkspaceState.test.ts for
// the same pattern).
//
// WaterTemperatureReminder.tsx and WaterTemperatureEntryDialog.tsx are
// deliberately thin: they render what these functions return and own only
// effects (fetch, focus, timers) that cannot be expressed as values.

import type {
	WaterTemperatureCheckDto,
	WaterTemperatureRecheckDto,
	WaterTemperatureStatus,
} from '@/db/queries/water-temperature';
import {
	MAX_ACTION_LENGTH,
	MAX_COMMENT_LENGTH,
	SAFE_MAX_TENTHS,
	SAFE_MIN_TENTHS,
	WATER_TEMPERATURE_FIXTURES,
	type ShiftSlot,
	type WaterTemperatureFixture,
} from '@/lib/water-temperature';

// ============================================================================
// COPY CONSTANTS
// ============================================================================

/**
 * Transcribed verbatim from the supplied paper form's above-115°F footer.
 * The final sentence's wording is partially inferred from a photographed
 * form whose edge was cut off, so this deliberately lives in exactly ONE
 * exported constant: correcting the transcription must be a one-line edit
 * that updates every surface (banner detail, action panel, recheck panel)
 * at once. Do not inline or paraphrase this text anywhere else.
 */
export const ABOVE_115_ESCALATION_INSTRUCTIONS =
	'IF TEMPERATURE IS ABOVE 115°F: Do not allow resident use. Notify the Home ' +
	'Coordinator/Supervisor immediately. If further escalation is needed, notify ' +
	'the Program Manager or Director. Document the issue and action taken, and ' +
	'recheck after corrective action. Always use a thermometer. Never rely on touch.';

/** Shown next to every free-text field: the narrative reaches inspector and
 * print output, so it must not carry resident-identifying content (R15). */
export const NARRATIVE_PRIVACY_NOTICE =
	'Do not enter resident names, initials, medical details, or any other ' +
	'resident-identifying information. This text appears in inspector and ' +
	'printed reports.';

export const SAFE_RANGE_LABEL = '110–115°F';

export const SAFE_RANGE_GUIDANCE =
	`Safe range is ${SAFE_RANGE_LABEL}. Measure with a thermometer at the ` +
	'beginning of the shift. Enter degrees Fahrenheit with at most one decimal ' +
	'place, for example 112.5.';

export const UNSAVED_ENTRY_WARNING =
	'You have unsaved water temperature readings. Leave without saving?';

export const FIXTURE_LABELS: Record<WaterTemperatureFixture, string> = {
	kitchen: 'Kitchen',
	bath_shower: 'Bath / Shower',
};

export const SHIFT_SLOT_LABELS: Record<ShiftSlot, string> = {
	1: '1st Shift',
	2: '2nd Shift',
	3: '3rd Shift',
};

// ============================================================================
// STABLE ELEMENT IDS
//
// Field ids are shared by the model (which names them in its error summary)
// and the dialog (which renders `id`, `aria-describedby`, and
// `aria-errormessage`), so a field, its label, its help text, and its error
// can never drift apart.
// ============================================================================

export const WATER_TEMPERATURE_ELEMENT_IDS = {
	dialog: 'water-temperature-dialog',
	dialogTitle: 'water-temperature-dialog-title',
	errorSummary: 'water-temperature-error-summary',
	escalation: 'water-temperature-escalation',
	kitchen: 'water-temperature-kitchen',
	bath: 'water-temperature-bath',
	comments: 'water-temperature-comments',
	action: 'water-temperature-action',
	recheckFixture: 'water-temperature-recheck-fixture',
	recheckTemp: 'water-temperature-recheck-temp',
	banner: 'water-temperature-banner',
	bannerCta: 'water-temperature-banner-cta',
} as const;

export function errorId(fieldId: string): string {
	return `${fieldId}-error`;
}

export function helpId(fieldId: string): string {
	return `${fieldId}-help`;
}

// ============================================================================
// REMINDER BANNER / BADGE DERIVATION
// ============================================================================

export type WaterTemperatureSeverity = 'none' | 'amber' | 'red';

export type WaterTemperatureBannerView = {
	status: WaterTemperatureStatus;
	severity: 'amber' | 'red';
	/** Semantic live region: routine obligations announce politely, unsafe
	 * ones announce assertively (R8's "announce due versus urgent"). */
	role: 'status' | 'alert';
	ariaLive: 'polite' | 'assertive';
	/** Icon plus a text alternative so the state is never conveyed by colour
	 * (or by a decorative glyph) alone. */
	icon: string;
	iconLabel: string;
	title: string;
	body: string;
	ctaLabel: string;
	/** `unknown` is a verification failure, not a completion: it offers an
	 * explicit retry and must never render as complete (R9). */
	showRetry: boolean;
	/** Urgent content pulls focus once, so a keyboard/screen-reader user is
	 * placed inside the actionable region rather than having to hunt for it. */
	focusOnAppear: boolean;
};

/**
 * `no_shift` (server: the caller has no open, classified shift) renders
 * nothing at all. `unknown` (client-synthesized: the status fetch failed)
 * renders an amber "unable to verify" banner with retry. Collapsing the two
 * would show every clocked-out user a spurious failure banner.
 */
export function deriveWaterTemperatureSeverity(
	status: WaterTemperatureStatus
): WaterTemperatureSeverity {
	switch (status) {
		case 'action_required':
		case 'recheck_required':
			return 'red';
		case 'due':
		case 'unknown':
			return 'amber';
		case 'complete':
		case 'complete_with_attention':
		case 'no_shift':
			return 'none';
	}
}

export function deriveWaterTemperatureBanner(
	status: WaterTemperatureStatus
): WaterTemperatureBannerView | null {
	switch (status) {
		case 'due':
			return {
				status,
				severity: 'amber',
				role: 'status',
				ariaLive: 'polite',
				icon: '🌡️',
				iconLabel: 'Due',
				title: 'Water temperature check due for this shift',
				body:
					'Record the kitchen and bath/shower temperatures for this house, ' +
					`date, and shift. Safe range is ${SAFE_RANGE_LABEL}.`,
				ctaLabel: 'Record water temperatures',
				showRetry: false,
				focusOnAppear: false,
			};
		case 'unknown':
			return {
				status,
				severity: 'amber',
				role: 'status',
				ariaLive: 'polite',
				icon: '❓',
				iconLabel: 'Unable to verify',
				title: 'Unable to verify the water temperature check',
				body:
					'This check has NOT been confirmed complete. Check your connection ' +
					'and retry, or open the form to reload the current record.',
				ctaLabel: 'Record water temperatures',
				showRetry: true,
				focusOnAppear: false,
			};
		case 'action_required':
			return {
				status,
				severity: 'red',
				role: 'alert',
				ariaLive: 'assertive',
				icon: '⚠️',
				iconLabel: 'Urgent',
				title: 'Unsafe water temperature — corrective action required',
				body:
					'A reading above 115°F was recorded and saved. Document the ' +
					'corrective action taken before recording a recheck.',
				ctaLabel: 'Document corrective action',
				showRetry: false,
				focusOnAppear: true,
			};
		case 'recheck_required':
			return {
				status,
				severity: 'red',
				role: 'alert',
				ariaLive: 'assertive',
				icon: '⚠️',
				iconLabel: 'Urgent',
				title: 'Unsafe water temperature — recheck required',
				body:
					'Recheck each affected fixture after corrective action until it ' +
					`reads within ${SAFE_RANGE_LABEL}.`,
				ctaLabel: 'Record recheck',
				showRetry: false,
				focusOnAppear: true,
			};
		case 'complete':
		case 'complete_with_attention':
		case 'no_shift':
			return null;
	}
}

export type WaterTemperatureBadgeView = {
	severity: 'amber' | 'red';
	/** Short visible glyph/text in the navigation item. */
	label: string;
	/** Full sentence for assistive technology; the badge is never
	 * colour-only or glyph-only. */
	srLabel: string;
};

export function deriveWaterTemperatureBadge(
	status: WaterTemperatureStatus
): WaterTemperatureBadgeView | null {
	switch (status) {
		case 'due':
			return {
				severity: 'amber',
				label: 'Due',
				srLabel: 'Water temperature check due for this shift',
			};
		case 'unknown':
			return {
				severity: 'amber',
				label: '?',
				srLabel: 'Water temperature check status could not be verified',
			};
		case 'action_required':
			return {
				severity: 'red',
				label: '!',
				srLabel: 'Water temperature: corrective action required',
			};
		case 'recheck_required':
			return {
				severity: 'red',
				label: '!',
				srLabel: 'Water temperature: recheck required',
			};
		case 'complete':
		case 'complete_with_attention':
		case 'no_shift':
			return null;
	}
}

/** The CTA opens the editor only for states that actually have work, and
 * never without a classified shift to anchor the write to. */
export function canOpenWaterTemperatureEntry(args: {
	identity: WaterTemperatureShiftIdentity | null;
	status: WaterTemperatureStatus;
}): boolean {
	if (!args.identity) return false;
	return (
		args.status === 'due' ||
		args.status === 'unknown' ||
		args.status === 'action_required' ||
		args.status === 'recheck_required'
	);
}

// ============================================================================
// STATUS FETCH MAPPING
// ============================================================================

const KNOWN_STATUSES: readonly WaterTemperatureStatus[] = [
	'due',
	'action_required',
	'recheck_required',
	'complete',
	'complete_with_attention',
	'no_shift',
	'unknown',
];

export type StatusFetchResult =
	/** The request completed and produced an HTTP response. */
	| {kind: 'response'; httpStatus: number; body: unknown}
	/** Network failure, timeout, or a thrown/aborted request. */
	| {kind: 'failure'};

/**
 * Translates one status request into a status the UI can render. Every
 * failure mode -- network error, non-200, missing/garbage payload, an
 * unrecognized future status string -- collapses to `unknown`, never to a
 * completion (R9: "never appear complete by default").
 */
export function mapStatusFetchResult(result: StatusFetchResult): WaterTemperatureStatus {
	if (result.kind === 'failure') return 'unknown';
	if (result.httpStatus !== 200) return 'unknown';
	const body = result.body;
	if (!body || typeof body !== 'object') return 'unknown';
	const status = (body as {status?: unknown}).status;
	if (typeof status !== 'string') return 'unknown';
	return KNOWN_STATUSES.includes(status as WaterTemperatureStatus)
		? (status as WaterTemperatureStatus)
		: 'unknown';
}

// ============================================================================
// SHIFT IDENTITY + STALE-RESPONSE GUARD
// ============================================================================

export type WaterTemperatureShiftIdentity = {
	shiftId: string;
	locationId: string;
	houseName: string;
	shiftSlot: ShiftSlot;
	operationalDate: string;
};

/**
 * Narrows the loosely-typed `/api/shifts/current` DTO to a complete,
 * classified identity. An unclassified legacy shift (null locationId /
 * slot / operationalDate) yields null: it cannot anchor a water-temperature
 * obligation, so no banner or editor is offered for it.
 */
export function toWaterTemperatureShiftIdentity(
	shift: unknown
): WaterTemperatureShiftIdentity | null {
	if (!shift || typeof shift !== 'object') return null;
	const candidate = shift as Record<string, unknown>;
	const shiftId = candidate.id;
	const locationId = candidate.locationId;
	const houseName = candidate.location;
	const shiftSlot = candidate.shiftSlot;
	const operationalDate = candidate.operationalDate;
	if (typeof shiftId !== 'string' || shiftId.length === 0) return null;
	if (typeof locationId !== 'string' || locationId.length === 0) return null;
	if (typeof operationalDate !== 'string' || operationalDate.length === 0) return null;
	if (shiftSlot !== 1 && shiftSlot !== 2 && shiftSlot !== 3) return null;
	return {
		shiftId,
		locationId,
		houseName: typeof houseName === 'string' ? houseName : '',
		shiftSlot,
		operationalDate,
	};
}

export function sameWaterTemperatureShiftIdentity(
	left: WaterTemperatureShiftIdentity | null,
	right: WaterTemperatureShiftIdentity | null
): boolean {
	if (!left || !right) return false;
	return (
		left.shiftId === right.shiftId &&
		left.locationId === right.locationId &&
		left.shiftSlot === right.shiftSlot &&
		left.operationalDate === right.operationalDate
	);
}

/**
 * Guards against a slow response from a previous house painting the current
 * one (R16/R18). Two independent conditions must both hold: the response
 * must belong to the newest request generation (an AbortController cancels
 * the socket, but a response already in flight can still resolve), and the
 * identity the request was issued for must still be the active identity.
 */
export function shouldApplyStatusResponse(args: {
	requestGeneration: number;
	currentGeneration: number;
	requestIdentity: WaterTemperatureShiftIdentity | null;
	currentIdentity: WaterTemperatureShiftIdentity | null;
}): boolean {
	if (args.requestGeneration !== args.currentGeneration) return false;
	return sameWaterTemperatureShiftIdentity(args.requestIdentity, args.currentIdentity);
}

/** An open editor belonging to a shift/house that is no longer current must
 * close rather than submit against the prior house's obligation. */
export function isWaterTemperatureEntryStale(args: {
	openedForIdentity: WaterTemperatureShiftIdentity | null;
	currentIdentity: WaterTemperatureShiftIdentity | null;
}): boolean {
	if (!args.openedForIdentity) return false;
	return !sameWaterTemperatureShiftIdentity(args.openedForIdentity, args.currentIdentity);
}

/** Bounded polling: only while clocked in and only while the tab is visible,
 * so a backgrounded portal does not poll indefinitely. Focus/visibility
 * changes trigger their own immediate refresh. */
export const WATER_TEMPERATURE_POLL_INTERVAL_MS = 60_000;

export function shouldPollWaterTemperatureStatus(args: {
	identity: WaterTemperatureShiftIdentity | null;
	documentHidden: boolean;
}): boolean {
	return Boolean(args.identity) && !args.documentHidden;
}

// ============================================================================
// FIELD PARSING + VALIDATION
// ============================================================================

export type FieldIssue = {fieldId: string; message: string};

/** One decimal place maximum, 0-250°F. Rejects `+`/`e` notation, thousands
 * separators, and >1 decimal digit explicitly rather than relying on
 * Number() coercion, so "112.55" fails here instead of at the server. */
const TEMPERATURE_PATTERN = /^\d{1,3}(\.\d)?$/;

export type TemperatureParseResult =
	| {ok: true; value: number}
	| {ok: false; message: string};

export function parseTemperatureField(raw: string): TemperatureParseResult {
	const trimmed = raw.trim();
	if (trimmed.length === 0) {
		return {ok: false, message: 'Enter a temperature in degrees Fahrenheit (°F).'};
	}
	if (!TEMPERATURE_PATTERN.test(trimmed)) {
		return {
			ok: false,
			message:
				'Enter degrees Fahrenheit as a number with at most one decimal place, ' +
				'for example 112.5.',
		};
	}
	const value = Number(trimmed);
	if (!Number.isFinite(value) || value < 0 || value > 250) {
		return {ok: false, message: 'Enter a temperature between 0 and 250 °F.'};
	}
	return {ok: true, value};
}

/** Presentation-only classification of a typed value, used to warn *before*
 * submit. It never blocks submission: an unsafe observation is a fact that
 * must be saved exactly as measured (R6, "Not To Do" #2). */
export function classifyTypedTemperature(
	raw: string
): 'safe' | 'below' | 'above' | 'unknown' {
	const parsed = parseTemperatureField(raw);
	if (!parsed.ok) return 'unknown';
	const tenths = Math.round(parsed.value * 10);
	if (tenths < SAFE_MIN_TENTHS) return 'below';
	if (tenths > SAFE_MAX_TENTHS) return 'above';
	return 'safe';
}

// Mirrors lib/validation-schemas.ts's server-side rejection so a malformed
// narrative fails inline with an associated field error instead of as an
// opaque 400.
const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/;

function validateNarrative(args: {
	fieldId: string;
	label: string;
	raw: string;
	maxLength: number;
	required: boolean;
}): {message: string | null; value: string | null} {
	const trimmed = args.raw.trim();
	if (trimmed.length === 0) {
		return args.required
			? {message: `${args.label} is required.`, value: null}
			: {message: null, value: null};
	}
	if (trimmed.length > args.maxLength) {
		return {
			message: `${args.label} must be ${args.maxLength} characters or fewer.`,
			value: null,
		};
	}
	if (CONTROL_CHAR_PATTERN.test(trimmed)) {
		return {message: `${args.label} contains unsupported characters.`, value: null};
	}
	return {message: null, value: trimmed};
}

export function remainingNarrativeCharacters(raw: string, maxLength: number): number {
	return maxLength - raw.trim().length;
}

// --- initial readings -------------------------------------------------------

export type InitialReadingsDraft = {
	kitchenTempF: string;
	bathTempF: string;
	comments: string;
};

export const EMPTY_INITIAL_READINGS_DRAFT: InitialReadingsDraft = {
	kitchenTempF: '',
	bathTempF: '',
	comments: '',
};

export type InitialReadingsValidation = {
	isValid: boolean;
	fieldErrors: {kitchenTempF: string | null; bathTempF: string | null; comments: string | null};
	/** Ordered error summary rendered above the form and linked to each
	 * field, so an assistive-technology user gets one landing place. */
	summary: FieldIssue[];
	values: {kitchenTempF: number; bathTempF: number; comments: string | null} | null;
};

export function validateInitialReadings(
	draft: InitialReadingsDraft
): InitialReadingsValidation {
	const kitchen = parseTemperatureField(draft.kitchenTempF);
	const bath = parseTemperatureField(draft.bathTempF);
	const comments = validateNarrative({
		fieldId: WATER_TEMPERATURE_ELEMENT_IDS.comments,
		label: 'Comments',
		raw: draft.comments,
		maxLength: MAX_COMMENT_LENGTH,
		required: false,
	});

	const fieldErrors = {
		kitchenTempF: kitchen.ok ? null : kitchen.message,
		bathTempF: bath.ok ? null : bath.message,
		comments: comments.message,
	};

	const summary: FieldIssue[] = [];
	if (fieldErrors.kitchenTempF) {
		summary.push({
			fieldId: WATER_TEMPERATURE_ELEMENT_IDS.kitchen,
			message: `Kitchen temperature: ${fieldErrors.kitchenTempF}`,
		});
	}
	if (fieldErrors.bathTempF) {
		summary.push({
			fieldId: WATER_TEMPERATURE_ELEMENT_IDS.bath,
			message: `Bath/shower temperature: ${fieldErrors.bathTempF}`,
		});
	}
	if (fieldErrors.comments) {
		summary.push({
			fieldId: WATER_TEMPERATURE_ELEMENT_IDS.comments,
			message: fieldErrors.comments,
		});
	}

	const isValid = summary.length === 0;
	return {
		isValid,
		fieldErrors,
		summary,
		values:
			isValid && kitchen.ok && bath.ok
				? {kitchenTempF: kitchen.value, bathTempF: bath.value, comments: comments.value}
				: null,
	};
}

export function canSubmitInitialReadings(args: {
	draft: InitialReadingsDraft;
	isSubmitting: boolean;
}): boolean {
	if (args.isSubmitting) return false;
	return validateInitialReadings(args.draft).isValid;
}

// --- corrective action ------------------------------------------------------

export type ActionDraft = {action: string};

export type ActionValidation = {
	isValid: boolean;
	fieldErrors: {action: string | null};
	summary: FieldIssue[];
	values: {action: string} | null;
};

export function validateActionDraft(draft: ActionDraft): ActionValidation {
	const action = validateNarrative({
		fieldId: WATER_TEMPERATURE_ELEMENT_IDS.action,
		label: 'Action taken',
		raw: draft.action,
		maxLength: MAX_ACTION_LENGTH,
		required: true,
	});
	const summary = action.message
		? [{fieldId: WATER_TEMPERATURE_ELEMENT_IDS.action, message: action.message}]
		: [];
	return {
		isValid: summary.length === 0,
		fieldErrors: {action: action.message},
		summary,
		values: action.value ? {action: action.value} : null,
	};
}

export function canSubmitAction(args: {draft: ActionDraft; isSubmitting: boolean}): boolean {
	if (args.isSubmitting) return false;
	return validateActionDraft(args.draft).isValid;
}

// --- recheck ----------------------------------------------------------------

export type RecheckDraft = {fixture: WaterTemperatureFixture | ''; tempF: string};

export const EMPTY_RECHECK_DRAFT: RecheckDraft = {fixture: '', tempF: ''};

export type RecheckValidation = {
	isValid: boolean;
	fieldErrors: {fixture: string | null; tempF: string | null};
	summary: FieldIssue[];
	values: {fixture: WaterTemperatureFixture; tempF: number} | null;
};

export function validateRecheckDraft(draft: RecheckDraft): RecheckValidation {
	const fixtureError =
		draft.fixture === '' || !WATER_TEMPERATURE_FIXTURES.includes(draft.fixture)
			? 'Select which fixture you rechecked.'
			: null;
	const temp = parseTemperatureField(draft.tempF);
	const fieldErrors = {fixture: fixtureError, tempF: temp.ok ? null : temp.message};

	const summary: FieldIssue[] = [];
	if (fieldErrors.fixture) {
		summary.push({
			fieldId: WATER_TEMPERATURE_ELEMENT_IDS.recheckFixture,
			message: fieldErrors.fixture,
		});
	}
	if (fieldErrors.tempF) {
		summary.push({
			fieldId: WATER_TEMPERATURE_ELEMENT_IDS.recheckTemp,
			message: `Recheck temperature: ${fieldErrors.tempF}`,
		});
	}

	const isValid = summary.length === 0;
	return {
		isValid,
		fieldErrors,
		summary,
		values:
			isValid && temp.ok && draft.fixture !== ''
				? {fixture: draft.fixture, tempF: temp.value}
				: null,
	};
}

export function canSubmitRecheck(args: {draft: RecheckDraft; isSubmitting: boolean}): boolean {
	if (args.isSubmitting) return false;
	return validateRecheckDraft(args.draft).isValid;
}

// ============================================================================
// UNSAVED NAVIGATION
// ============================================================================

export type WaterTemperatureDraftBundle = {
	initial: InitialReadingsDraft;
	action: ActionDraft;
	recheck: RecheckDraft;
};

export const EMPTY_DRAFT_BUNDLE: WaterTemperatureDraftBundle = {
	initial: EMPTY_INITIAL_READINGS_DRAFT,
	action: {action: ''},
	recheck: EMPTY_RECHECK_DRAFT,
};

export function hasUnsavedWaterTemperatureEntry(
	draft: WaterTemperatureDraftBundle
): boolean {
	return (
		draft.initial.kitchenTempF.trim().length > 0 ||
		draft.initial.bathTempF.trim().length > 0 ||
		draft.initial.comments.trim().length > 0 ||
		draft.action.action.trim().length > 0 ||
		draft.recheck.fixture !== '' ||
		draft.recheck.tempF.trim().length > 0
	);
}

export type CloseIntent = 'close' | 'confirm-discard' | 'ignore';

/** Escape / backdrop / Cancel all route through here so the unsaved warning
 * cannot be bypassed by one of them. A submit in flight ignores the close
 * request entirely rather than abandoning a write whose outcome is unknown. */
export function resolveCloseIntent(args: {
	draft: WaterTemperatureDraftBundle;
	isSubmitting: boolean;
	discardConfirmed: boolean;
}): CloseIntent {
	if (args.isSubmitting) return 'ignore';
	if (!hasUnsavedWaterTemperatureEntry(args.draft)) return 'close';
	return args.discardConfirmed ? 'close' : 'confirm-discard';
}

// ============================================================================
// CLOCK-OUT WARNING
// ============================================================================

export function shouldWarnBeforeClockOut(status: WaterTemperatureStatus): boolean {
	return (
		status === 'due' ||
		status === 'unknown' ||
		status === 'action_required' ||
		status === 'recheck_required'
	);
}

export type ClockOutDecision = {
	/** Clock-out is never blocked by this feature (R10 / "Not To Do" #5); it
	 * only requires an acknowledgement the first time. */
	proceed: boolean;
	requiresConfirmation: boolean;
	warning: string | null;
};

export function resolveClockOutDecision(args: {
	status: WaterTemperatureStatus;
	confirmed: boolean;
}): ClockOutDecision {
	if (!shouldWarnBeforeClockOut(args.status)) {
		return {proceed: true, requiresConfirmation: false, warning: null};
	}
	const warning = clockOutWarningMessage(args.status);
	return {proceed: args.confirmed, requiresConfirmation: true, warning};
}

export function clockOutWarningMessage(status: WaterTemperatureStatus): string | null {
	switch (status) {
		case 'due':
			return (
				'The water temperature check for this house, date, and shift has not ' +
				'been recorded. You can still clock out, but the shift will remain ' +
				'open for follow-up.'
			);
		case 'unknown':
			return (
				'The water temperature check could not be verified. You can still ' +
				'clock out, but it may remain outstanding for follow-up.'
			);
		case 'action_required':
			return (
				'A water temperature above 115°F is unresolved: corrective action has ' +
				'not been documented. You can still clock out, but this stays visible ' +
				'to your supervisor and to replacement staff.'
			);
		case 'recheck_required':
			return (
				'A water temperature above 115°F is unresolved: at least one fixture ' +
				'still needs a safe recheck. You can still clock out, but this stays ' +
				'visible to your supervisor and to replacement staff.'
			);
		default:
			return null;
	}
}

/**
 * After a completed clock-out the caller has no active shift, so the *staff*
 * banner clears locally. The server-side obligation is untouched and remains
 * visible to supervisors and to replacement staff (R10).
 */
export function statusAfterClockOut(): WaterTemperatureStatus {
	return 'no_shift';
}

// ============================================================================
// MUTATION FAILURE MAPPING
// ============================================================================

export type WaterTemperatureFailureKind =
	| 'completed_by_other'
	| 'no_active_shift'
	| 'stale'
	| 'not_found'
	| 'access_denied'
	| 'unauthenticated'
	| 'validation'
	| 'network'
	| 'server';

export type WaterTemperatureFailure = {
	kind: WaterTemperatureFailureKind;
	message: string;
	/** The caller must reload the authoritative obligation before offering a
	 * retry, rather than blindly resubmitting. */
	reload: boolean;
	/** Never discard what the user typed on a recoverable conflict (R17). */
	preserveDraft: boolean;
	/** The winning record the server handed back on a 409, if any. */
	current: WaterTemperatureCheckDto | null;
	role: 'status' | 'alert';
};

function readCurrent(body: unknown): WaterTemperatureCheckDto | null {
	if (!body || typeof body !== 'object') return null;
	const current = (body as {current?: unknown}).current;
	if (!current || typeof current !== 'object') return null;
	return current as WaterTemperatureCheckDto;
}

function readErrorMessage(body: unknown): string | null {
	if (!body || typeof body !== 'object') return null;
	const error = (body as {error?: unknown}).error;
	return typeof error === 'string' && error.trim().length > 0 ? error : null;
}

function readCode(body: unknown): string | null {
	if (!body || typeof body !== 'object') return null;
	const code = (body as {code?: unknown}).code;
	return typeof code === 'string' ? code : null;
}

export function describeWinningCheck(current: WaterTemperatureCheckDto | null): string {
	if (!current) return '';
	const slot = SHIFT_SLOT_LABELS[current.shiftSlot] ?? `Shift ${current.shiftSlot}`;
	return (
		` ${current.houseName} — ${current.operationalDate}, ${slot}: kitchen ` +
		`${current.kitchenTempF.toFixed(1)}°F, bath/shower ` +
		`${current.bathTempF.toFixed(1)}°F, recorded by ${current.staffInitials}.`
	);
}

/**
 * Turns one failed mutation into a typed, actionable outcome. The important
 * case is a duplicate create (`409 UNIQUE_CONFLICT`): the shared house/day/
 * slot obligation was satisfied by a colleague, which is a *success* for the
 * house even though this request failed, and must never surface as a generic
 * error (R17/AE6). `httpStatus: null` means no response was received at all.
 */
export function mapWaterTemperatureFailure(args: {
	operation: 'create' | 'action' | 'recheck';
	httpStatus: number | null;
	body: unknown;
}): WaterTemperatureFailure {
	const current = readCurrent(args.body);
	const code = readCode(args.body);
	const serverMessage = readErrorMessage(args.body);

	if (args.httpStatus === null) {
		return {
			kind: 'network',
			message:
				'Your entry could not be confirmed. Reloading the current record — ' +
				'your readings have been kept so you can retry without retyping.',
			reload: true,
			preserveDraft: true,
			current: null,
			role: 'status',
		};
	}

	if (args.httpStatus === 409) {
		if (code === 'NO_ACTIVE_SHIFT') {
			return {
				kind: 'no_active_shift',
				message:
					'This entry needs an open shift for the same house, date, and ' +
					'shift. Clock in again, then re-enter your readings.',
				reload: true,
				preserveDraft: true,
				current,
				role: 'alert',
			};
		}
		if (code === 'UNIQUE_CONFLICT' && args.operation === 'create') {
			return {
				kind: 'completed_by_other',
				message:
					'Another staff member completed this check for this house, date, ' +
					'and shift, so your entry was not saved as a second record.' +
					describeWinningCheck(current),
				reload: true,
				preserveDraft: false,
				current,
				role: 'status',
			};
		}
		return {
			kind: 'stale',
			message:
				'This check was updated by someone else while you were entering ' +
				'yours. The current record has been reloaded — review it and submit ' +
				'again. Your entry has been kept.',
			reload: true,
			preserveDraft: true,
			current,
			role: 'alert',
		};
	}

	if (args.httpStatus === 404) {
		return {
			kind: 'not_found',
			message:
				'This check is no longer available for your shift. Reloading the ' +
				'current record.',
			reload: true,
			preserveDraft: true,
			current: null,
			role: 'alert',
		};
	}

	if (args.httpStatus === 403) {
		return {
			kind: 'access_denied',
			message: 'You are not authorized to record this check.',
			reload: true,
			preserveDraft: true,
			current: null,
			role: 'alert',
		};
	}

	if (args.httpStatus === 401) {
		return {
			kind: 'unauthenticated',
			message: 'Your session has expired. Sign in again to record this check.',
			reload: false,
			preserveDraft: true,
			current: null,
			role: 'alert',
		};
	}

	if (args.httpStatus >= 400 && args.httpStatus < 500) {
		return {
			kind: 'validation',
			message: serverMessage || 'Your entry could not be saved. Check the values and try again.',
			reload: false,
			preserveDraft: true,
			current: null,
			role: 'alert',
		};
	}

	return {
		kind: 'server',
		message:
			'The check could not be saved right now. Reloading the current record — ' +
			'your entry has been kept so you can retry.',
		reload: true,
		preserveDraft: true,
		current: null,
		role: 'alert',
	};
}

// ============================================================================
// ENTRY PHASE + RESUMABLE ABOVE-115 WORKFLOW
// ============================================================================

export type WaterTemperatureEntryPhase = 'initial' | 'action' | 'recheck' | 'resolved';

/**
 * Which panel the editor shows. Derived purely from the authoritative
 * record, so closing the dialog, reloading the page, or handing the device
 * to a replacement worker resumes at exactly the same step (AE3) without
 * losing the original reading.
 */
export function deriveEntryPhase(
	check: WaterTemperatureCheckDto | null
): WaterTemperatureEntryPhase {
	if (!check || check.voidedAt) return 'initial';
	switch (check.state) {
		case 'action_required':
			return 'action';
		case 'recheck_required':
			return 'recheck';
		case 'complete':
		case 'complete_with_attention':
			return 'resolved';
		default:
			return 'initial';
	}
}

export type FixtureResolution = {
	fixture: WaterTemperatureFixture;
	label: string;
	/** The immutable original observation. A later safe recheck never
	 * replaces it (R7). */
	originalTempF: number;
	latestRecheckTempF: number | null;
	latestRecheckInitials: string | null;
	resolved: boolean;
	recheckHistory: WaterTemperatureRecheckDto[];
};

function activeRechecksFor(
	check: WaterTemperatureCheckDto,
	fixture: WaterTemperatureFixture
): WaterTemperatureRecheckDto[] {
	return check.rechecks
		.filter(
			(recheck) =>
				recheck.fixture === fixture && !recheck.supersededAt && !recheck.voidedAt
		)
		.slice()
		.sort((left, right) => left.sequence - right.sequence);
}

/** The fixtures whose ORIGINAL reading was above 115°F, plus whether each
 * one's latest active recheck has brought it back into range. */
export function deriveAffectedFixtures(
	check: WaterTemperatureCheckDto | null
): FixtureResolution[] {
	if (!check) return [];
	const originals: Record<WaterTemperatureFixture, number> = {
		kitchen: check.kitchenTempF,
		bath_shower: check.bathTempF,
	};
	const classifications: Record<WaterTemperatureFixture, string> = {
		kitchen: check.kitchenClassification,
		bath_shower: check.bathClassification,
	};

	return WATER_TEMPERATURE_FIXTURES.filter(
		(fixture) => classifications[fixture] === 'above'
	).map((fixture) => {
		const history = activeRechecksFor(check, fixture);
		const latest = history.length > 0 ? history[history.length - 1]! : null;
		return {
			fixture,
			label: FIXTURE_LABELS[fixture],
			originalTempF: originals[fixture],
			latestRecheckTempF: latest ? latest.tempF : null,
			latestRecheckInitials: latest ? latest.staffInitials : null,
			resolved: latest !== null && latest.classification === 'safe',
			recheckHistory: history,
		};
	});
}

/** Only fixtures that started above 115°F and are still unresolved may be
 * selected for a recheck, so staff cannot append a recheck to a fixture that
 * never required one. */
export function selectableRecheckFixtures(
	check: WaterTemperatureCheckDto | null
): FixtureResolution[] {
	return deriveAffectedFixtures(check).filter((fixture) => !fixture.resolved);
}

export type OriginalReadingSummary = {
	fixture: WaterTemperatureFixture;
	label: string;
	tempF: number;
	classification: 'safe' | 'below' | 'above';
	/** Text alternative so an out-of-range value is never signalled by red
	 * text alone. */
	classificationLabel: string;
};

export function deriveOriginalReadingSummary(
	check: WaterTemperatureCheckDto | null
): OriginalReadingSummary[] {
	if (!check) return [];
	const entries: OriginalReadingSummary[] = [
		{
			fixture: 'kitchen',
			label: FIXTURE_LABELS.kitchen,
			tempF: check.kitchenTempF,
			classification: check.kitchenClassification,
			classificationLabel: classificationLabel(check.kitchenClassification),
		},
		{
			fixture: 'bath_shower',
			label: FIXTURE_LABELS.bath_shower,
			tempF: check.bathTempF,
			classification: check.bathClassification,
			classificationLabel: classificationLabel(check.bathClassification),
		},
	];
	return entries;
}

export function classificationLabel(classification: 'safe' | 'below' | 'above'): string {
	switch (classification) {
		case 'safe':
			return `In range (${SAFE_RANGE_LABEL})`;
		case 'below':
			return `Below range (under 110°F)`;
		case 'above':
			return `Above range (over 115°F) — unsafe`;
	}
}

// ============================================================================
// DIALOG FOCUS / KEYBOARD PLAN
// ============================================================================

export type DialogFocusPlan = {
	/** Element that receives focus when the dialog opens or the phase
	 * changes; an error summary always wins so the user lands on the problem. */
	initialFocusId: string;
	/** Focus returns to the CTA that opened the dialog on close/cancel. */
	returnFocusId: string;
	/** Focus is trapped inside the dialog container while it is open. */
	trapWithinId: string;
	/** Urgent phases move focus into the escalation instructions so they are
	 * announced before the fields. */
	announceEscalation: boolean;
};

export function planDialogFocus(args: {
	phase: WaterTemperatureEntryPhase;
	hasErrorSummary: boolean;
	invokerId?: string;
}): DialogFocusPlan {
	const ids = WATER_TEMPERATURE_ELEMENT_IDS;
	const announceEscalation = args.phase === 'action' || args.phase === 'recheck';

	let initialFocusId: string;
	if (args.hasErrorSummary) {
		initialFocusId = ids.errorSummary;
	} else if (args.phase === 'action') {
		initialFocusId = ids.escalation;
	} else if (args.phase === 'recheck') {
		initialFocusId = ids.escalation;
	} else if (args.phase === 'resolved') {
		initialFocusId = ids.dialogTitle;
	} else {
		initialFocusId = ids.kitchen;
	}

	return {
		initialFocusId,
		returnFocusId: args.invokerId ?? ids.bannerCta,
		trapWithinId: ids.dialog,
		announceEscalation,
	};
}

export type DialogKeyAction = 'close' | 'confirm-discard' | 'ignore' | 'submit';

/** Keyboard-complete dialog behaviour, expressed as a value so it can be
 * asserted without a DOM: Escape routes through the unsaved-changes gate,
 * Ctrl/Cmd+Enter submits when the form is submittable, everything else is
 * left to the browser. */
export function resolveDialogKeyAction(args: {
	key: string;
	ctrlOrMetaKey?: boolean;
	draft: WaterTemperatureDraftBundle;
	isSubmitting: boolean;
	canSubmit: boolean;
}): DialogKeyAction {
	if (args.key === 'Escape') {
		return resolveCloseIntent({
			draft: args.draft,
			isSubmitting: args.isSubmitting,
			discardConfirmed: false,
		});
	}
	if (args.key === 'Enter' && args.ctrlOrMetaKey) {
		return args.canSubmit && !args.isSubmitting ? 'submit' : 'ignore';
	}
	return 'ignore';
}

// ============================================================================
// SERVER-CONTEXT HEADER (read-only)
// ============================================================================

export type EntryContextView = {
	houseName: string;
	operationalDate: string;
	shiftSlotLabel: string;
	initials: string;
	/** Every one of these is server-owned; the form renders them as text, not
	 * as inputs, and never sends them (R16/KTD6). */
	readOnlyNote: string;
};

/**
 * Display-only initials fallback for a check that does not exist yet. The
 * server derives and stores the authoritative snapshot from the
 * authenticated identity (db/queries/water-temperature.ts's
 * computeStaffInitials); this is never submitted.
 */
export function deriveDisplayInitials(name: string | null | undefined): string {
	if (!name) return '—';
	const words = name.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '—';
	return words
		.slice(0, 10)
		.map((word) => word[0]!.toUpperCase())
		.join('')
		.slice(0, 10);
}

export function deriveEntryContext(args: {
	identity: WaterTemperatureShiftIdentity;
	check: WaterTemperatureCheckDto | null;
	sessionUserName?: string | null;
}): EntryContextView {
	return {
		houseName: args.check?.houseName || args.identity.houseName,
		operationalDate: args.check?.operationalDate || args.identity.operationalDate,
		shiftSlotLabel:
			SHIFT_SLOT_LABELS[args.check?.shiftSlot ?? args.identity.shiftSlot] ?? 'Shift',
		initials: args.check?.staffInitials || deriveDisplayInitials(args.sessionUserName),
		readOnlyNote:
			'House, date, shift, and initials are recorded automatically from your ' +
			'active shift and cannot be edited here.',
	};
}

/** Finds the single active obligation for the caller's shift inside a month
 * listing. Voided records are already excluded server-side; the extra guard
 * keeps the client correct if `includeVoided` is ever passed. */
export function findCheckForIdentity(
	records: readonly WaterTemperatureCheckDto[],
	identity: WaterTemperatureShiftIdentity
): WaterTemperatureCheckDto | null {
	return (
		records.find(
			(record) =>
				record.locationId === identity.locationId &&
				record.operationalDate === identity.operationalDate &&
				record.shiftSlot === identity.shiftSlot &&
				!record.voidedAt
		) ?? null
	);
}

/** Idempotency identifiers for create/action/recheck retries (R17). Minted
 * once per attempt and reused across retries of that same attempt so a
 * network-ambiguous submit cannot create a duplicate. */
export function newIdempotencyKey(
	prefix: 'create' | 'action' | 'recheck',
	random: () => string = defaultRandomId
): string {
	return `${prefix}-${random()}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100);
}

function defaultRandomId(): string {
	const cryptoRef = globalThis.crypto;
	if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
		return cryptoRef.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
