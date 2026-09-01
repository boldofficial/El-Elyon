// src/components/care/WaterTemperatureEntryDialog.tsx

'use client';

import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {WaterTemperatureCheckDto, WaterTemperatureStatus} from '@/db/queries/water-temperature';
import {MAX_ACTION_LENGTH, MAX_COMMENT_LENGTH} from '@/lib/water-temperature';
import {
	ABOVE_115_ESCALATION_INSTRUCTIONS,
	EMPTY_DRAFT_BUNDLE,
	NARRATIVE_PRIVACY_NOTICE,
	SAFE_RANGE_GUIDANCE,
	SAFE_RANGE_LABEL,
	UNSAVED_ENTRY_WARNING,
	WATER_TEMPERATURE_ELEMENT_IDS,
	canSubmitAction,
	canSubmitInitialReadings,
	canSubmitRecheck,
	classifyTypedTemperature,
	deriveAffectedFixtures,
	deriveEntryContext,
	deriveEntryPhase,
	deriveOriginalReadingSummary,
	errorId,
	findCheckForIdentity,
	helpId,
	hasUnsavedWaterTemperatureEntry,
	mapWaterTemperatureFailure,
	newIdempotencyKey,
	planDialogFocus,
	remainingNarrativeCharacters,
	resolveCloseIntent,
	selectableRecheckFixtures,
	validateActionDraft,
	validateInitialReadings,
	validateRecheckDraft,
	type FieldIssue,
	type WaterTemperatureDraftBundle,
	type WaterTemperatureFailure,
	type WaterTemperatureShiftIdentity,
} from './waterTemperatureEntryModel';

const IDS = WATER_TEMPERATURE_ELEMENT_IDS;

const TOUCH_TARGET =
	'min-h-[44px] inline-flex items-center justify-center focus:outline-none ' +
	'focus-visible:ring-2 focus-visible:ring-offset-2';

const FIELD_CLASSES =
	'w-full rounded-lg border px-3 py-2 text-gray-900 shadow-sm min-h-[44px] ' +
	'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ' +
	'focus-visible:ring-blue-500 disabled:opacity-50';

const FOCUSABLE_SELECTOR =
	'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), ' +
	'textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface WaterTemperatureEntryDialogProps {
	identity: WaterTemperatureShiftIdentity;
	status: WaterTemperatureStatus;
	sessionUserName?: string | null;
	/** Fired after every successful mutation so the portal can run an
	 * authoritative status refetch (R9). */
	onMutated: () => void;
	onClose: () => void;
	/** Element to return focus to on close; defaults to the banner CTA. */
	invokerId?: string;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * The staff water-temperature editor.
 *
 * House/date/slot/initials are read-only server context: they are displayed,
 * never edited, and never submitted -- the server derives them from the
 * caller's active shift (R16/KTD6). The dialog resumes from the
 * authoritative record every time it opens, so an above-115°F observation
 * and its ordered recheck chain survive a reload, a different device, or a
 * replacement worker (AE3).
 */
export default function WaterTemperatureEntryDialog({
	identity,
	status,
	sessionUserName,
	onMutated,
	onClose,
	invokerId,
}: WaterTemperatureEntryDialogProps) {
	const [check, setCheck] = useState<WaterTemperatureCheckDto | null>(null);
	const [loadState, setLoadState] = useState<LoadState>('loading');
	const [loadError, setLoadError] = useState<string | null>(null);
	const [draft, setDraft] = useState<WaterTemperatureDraftBundle>(EMPTY_DRAFT_BUNDLE);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showErrors, setShowErrors] = useState(false);
	const [failure, setFailure] = useState<WaterTemperatureFailure | null>(null);
	const [notice, setNotice] = useState<string | null>(null);

	const containerRef = useRef<HTMLDivElement | null>(null);
	const abortRef = useRef<AbortController | null>(null);
	// One idempotency key per in-progress attempt, reused across retries of
	// that attempt so a network-ambiguous submit can never create a duplicate
	// (R17). Cleared on success.
	const idempotencyRef = useRef<{create?: string; action?: string; recheck?: string}>({});

	const phase = deriveEntryPhase(check);
	const context = useMemo(
		() => deriveEntryContext({identity, check, sessionUserName}),
		[identity, check, sessionUserName]
	);

	const initialValidation = validateInitialReadings(draft.initial);
	const actionValidation = validateActionDraft(draft.action);
	const recheckValidation = validateRecheckDraft(draft.recheck);

	const activeSummary: FieldIssue[] = !showErrors
		? []
		: phase === 'initial'
			? initialValidation.summary
			: phase === 'action'
				? actionValidation.summary
				: phase === 'recheck'
					? recheckValidation.summary
					: [];

	// --- loading the authoritative record -----------------------------------

	const loadCurrentCheck = useCallback(
		async (options: {silent?: boolean} = {}) => {
			if (!options.silent) setLoadState('loading');
			setLoadError(null);
			const [year, month] = identity.operationalDate.split('-');
			const params = new URLSearchParams({
				locationId: identity.locationId,
				year: String(Number(year)),
				month: String(Number(month)),
			});
			try {
				const response = await fetch(
					`/api/documents/water-temperature-checks?${params.toString()}`,
					{cache: 'no-store'}
				);
				if (!response.ok) {
					setLoadState('error');
					setLoadError(
						'The current record could not be loaded. Retry before entering readings ' +
							'so you do not duplicate a colleague’s entry.'
					);
					return;
				}
				const payload = await response.json();
				const records: WaterTemperatureCheckDto[] = Array.isArray(payload?.data)
					? payload.data
					: [];
				setCheck(findCheckForIdentity(records, identity));
				setLoadState('ready');
			} catch {
				setLoadState('error');
				setLoadError(
					'The current record could not be loaded. Check your connection and retry.'
				);
			}
		},
		[identity]
	);

	useEffect(() => {
		void loadCurrentCheck();
	}, [loadCurrentCheck]);

	useEffect(() => () => abortRef.current?.abort(), []);

	// --- focus management ----------------------------------------------------

	const hasErrorSummary = activeSummary.length > 0;
	const focusPlan = planDialogFocus({phase, hasErrorSummary, invokerId});

	// Focus the planned target exactly three times: when the dialog first
	// becomes usable, when the workflow phase advances (initial -> action ->
	// recheck -> resolved), and when an error summary newly appears. It must
	// NOT re-fire when the user finishes correcting the last error, which
	// would yank focus out of the field they are typing in.
	const focusStateRef = useRef<{phase: typeof phase; hasErrorSummary: boolean} | null>(null);
	useEffect(() => {
		if (loadState !== 'ready') return;
		const previous = focusStateRef.current;
		focusStateRef.current = {phase, hasErrorSummary};
		const isFirstReady = previous === null;
		const phaseChanged = previous !== null && previous.phase !== phase;
		const errorsAppeared = previous !== null && !previous.hasErrorSummary && hasErrorSummary;
		if (!isFirstReady && !phaseChanged && !errorsAppeared) return;
		const targetId = planDialogFocus({phase, hasErrorSummary, invokerId}).initialFocusId;
		document.getElementById(targetId)?.focus();
	}, [loadState, phase, hasErrorSummary, invokerId]);

	// Return focus to the control that opened the dialog (R8 accessibility).
	useEffect(() => {
		const returnFocusId = focusPlan.returnFocusId;
		return () => {
			window.setTimeout(() => {
				document.getElementById(returnFocusId)?.focus();
			}, 0);
		};
	}, [focusPlan.returnFocusId]);

	// Warn before a full-page navigation/refresh discards typed readings.
	useEffect(() => {
		const handler = (event: BeforeUnloadEvent) => {
			if (!hasUnsavedWaterTemperatureEntry(draft)) return;
			event.preventDefault();
			event.returnValue = UNSAVED_ENTRY_WARNING;
		};
		window.addEventListener('beforeunload', handler);
		return () => window.removeEventListener('beforeunload', handler);
	}, [draft]);

	const requestClose = useCallback(() => {
		const intent = resolveCloseIntent({draft, isSubmitting, discardConfirmed: false});
		if (intent === 'ignore') return;
		if (intent === 'close') {
			onClose();
			return;
		}
		if (window.confirm(UNSAVED_ENTRY_WARNING)) onClose();
	}, [draft, isSubmitting, onClose]);

	// Keyboard-complete dialog: Escape routes through the unsaved gate, Tab
	// cycles within the dialog so focus cannot land on the obscured portal.
	const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Escape') {
			event.stopPropagation();
			requestClose();
			return;
		}
		if (event.key !== 'Tab') return;
		const container = containerRef.current;
		if (!container) return;
		const focusable = Array.from(
			container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
		).filter((element) => element.offsetParent !== null || element === document.activeElement);
		if (focusable.length === 0) return;
		const first = focusable[0]!;
		const last = focusable[focusable.length - 1]!;
		if (event.shiftKey && document.activeElement === first) {
			event.preventDefault();
			last.focus();
		} else if (!event.shiftKey && document.activeElement === last) {
			event.preventDefault();
			first.focus();
		}
	};

	// --- submission ----------------------------------------------------------

	async function submit(
		operation: 'create' | 'action' | 'recheck',
		url: string,
		body: Record<string, unknown>
	) {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setFailure(null);
		setNotice(null);

		const controller = new AbortController();
		abortRef.current = controller;

		try {
			const response = await fetch(url, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(body),
				signal: controller.signal,
			});
			const payload = await response.json().catch(() => null);

			if (!response.ok) {
				const mapped = mapWaterTemperatureFailure({
					operation,
					httpStatus: response.status,
					body: payload,
				});
				await applyFailure(mapped, operation);
				return;
			}

			// Success: burn the idempotency key so the next attempt is a new one.
			delete idempotencyRef.current[operation];
			setCheck(payload as WaterTemperatureCheckDto);
			setShowErrors(false);
			setDraft((current) =>
				operation === 'create'
					? {...current, initial: EMPTY_DRAFT_BUNDLE.initial}
					: operation === 'action'
						? {...current, action: EMPTY_DRAFT_BUNDLE.action}
						: {...current, recheck: EMPTY_DRAFT_BUNDLE.recheck}
			);
			setNotice(successNotice(operation, payload as WaterTemperatureCheckDto));
			onMutated();
		} catch {
			// No response at all: the write may or may not have committed, so
			// reload the authoritative record before offering a retry (R17).
			const mapped = mapWaterTemperatureFailure({operation, httpStatus: null, body: null});
			await applyFailure(mapped, operation);
		} finally {
			setIsSubmitting(false);
			abortRef.current = null;
		}
	}

	async function applyFailure(
		mapped: WaterTemperatureFailure,
		operation: 'create' | 'action' | 'recheck'
	) {
		setFailure(mapped);
		if (!mapped.preserveDraft) {
			setDraft((current) =>
				operation === 'create' ? {...current, initial: EMPTY_DRAFT_BUNDLE.initial} : current
			);
			delete idempotencyRef.current[operation];
		}
		if (mapped.current) {
			// The server handed back the winning record: adopt it directly
			// rather than making the user wait for another round trip.
			setCheck(mapped.current);
			onMutated();
			return;
		}
		if (mapped.reload) {
			await loadCurrentCheck({silent: true});
			onMutated();
		}
	}

	function keyFor(operation: 'create' | 'action' | 'recheck'): string {
		const existing = idempotencyRef.current[operation];
		if (existing) return existing;
		const minted = newIdempotencyKey(operation);
		idempotencyRef.current[operation] = minted;
		return minted;
	}

	const handleSubmitInitial = async (event: React.FormEvent) => {
		event.preventDefault();
		setShowErrors(true);
		if (!canSubmitInitialReadings({draft: draft.initial, isSubmitting})) return;
		const values = initialValidation.values!;
		await submit('create', '/api/documents/water-temperature-checks', {
			source: 'shift',
			kitchenTempF: values.kitchenTempF,
			bathTempF: values.bathTempF,
			comments: values.comments,
			idempotencyKey: keyFor('create'),
		});
	};

	const handleSubmitAction = async (event: React.FormEvent) => {
		event.preventDefault();
		setShowErrors(true);
		if (!check) return;
		if (!canSubmitAction({draft: draft.action, isSubmitting})) return;
		await submit('action', `/api/documents/water-temperature-checks/${check.id}/rechecks`, {
			type: 'action',
			expectedVersion: check.version,
			action: actionValidation.values!.action,
			idempotencyKey: keyFor('action'),
		});
	};

	const handleSubmitRecheck = async (event: React.FormEvent) => {
		event.preventDefault();
		setShowErrors(true);
		if (!check) return;
		if (!canSubmitRecheck({draft: draft.recheck, isSubmitting})) return;
		const values = recheckValidation.values!;
		await submit('recheck', `/api/documents/water-temperature-checks/${check.id}/rechecks`, {
			type: 'recheck',
			expectedVersion: check.version,
			fixture: values.fixture,
			tempF: values.tempF,
			measuredAt: new Date().toISOString(),
			idempotencyKey: keyFor('recheck'),
		});
	};

	// --- render --------------------------------------------------------------

	return (
		<div
			className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
			onMouseDown={(event) => {
				if (event.target === event.currentTarget) requestClose();
			}}>
			<div
				id={IDS.dialog}
				ref={containerRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={IDS.dialogTitle}
				onKeyDown={handleKeyDown}
				className="w-full max-w-2xl rounded-lg bg-white shadow-xl my-4">
				<div className="flex items-start justify-between gap-4 border-b p-4 sm:p-6">
					<div className="min-w-0">
						<h2
							id={IDS.dialogTitle}
							tabIndex={-1}
							className="text-lg font-bold text-gray-900 focus:outline-none">
							Daily Water Temperature Check
						</h2>
						<p className="mt-1 text-sm text-gray-600">{SAFE_RANGE_GUIDANCE}</p>
					</div>
					<button
						type="button"
						onClick={requestClose}
						className={`${TOUCH_TARGET} min-w-[44px] rounded-lg border border-gray-300 px-3 text-gray-700 hover:bg-gray-100 focus-visible:ring-blue-500`}>
						<span aria-hidden="true">✕</span>
						<span className="sr-only">Close water temperature check</span>
					</button>
				</div>

				<div className="p-4 sm:p-6 space-y-5">
					<ServerContextPanel context={context} />

					{/* Every outcome message is a live region so it is announced
					    without the user hunting for it. */}
					<div role="status" aria-live="polite" aria-atomic="true">
						{notice && (
							<p className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">
								<span className="font-semibold">Saved. </span>
								{notice}
							</p>
						)}
					</div>

					{failure && (
						<div
							role={failure.role}
							aria-live={failure.role === 'alert' ? 'assertive' : 'polite'}
							aria-atomic="true"
							className={`rounded-lg border p-3 text-sm ${
								failure.kind === 'completed_by_other'
									? 'border-blue-300 bg-blue-50 text-blue-900'
									: 'border-red-300 bg-red-50 text-red-900'
							}`}>
							<span className="font-semibold">
								{failure.kind === 'completed_by_other' ? 'Already completed. ' : 'Not saved. '}
							</span>
							{failure.message}
						</div>
					)}

					{loadState === 'loading' && (
						<p role="status" className="text-sm text-gray-600">
							Loading the current record for this house, date, and shift…
						</p>
					)}

					{loadState === 'error' && (
						<div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3">
							<p className="text-sm text-amber-900">{loadError}</p>
							<button
								type="button"
								onClick={() => void loadCurrentCheck()}
								className={`${TOUCH_TARGET} mt-3 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 focus-visible:ring-amber-500`}>
								Retry
							</button>
						</div>
					)}

					{loadState === 'ready' && (
						<>
							{activeSummary.length > 0 && <ErrorSummary issues={activeSummary} />}

							{check && <OriginalReadings check={check} />}

							{phase === 'initial' && (
								<InitialReadingsForm
									draft={draft}
									setDraft={setDraft}
									showErrors={showErrors}
									validation={initialValidation}
									isSubmitting={isSubmitting}
									onSubmit={handleSubmitInitial}
									onCancel={requestClose}
								/>
							)}

							{phase === 'action' && (
								<ActionForm
									draft={draft}
									setDraft={setDraft}
									showErrors={showErrors}
									validation={actionValidation}
									isSubmitting={isSubmitting}
									onSubmit={handleSubmitAction}
									onCancel={requestClose}
								/>
							)}

							{phase === 'recheck' && check && (
								<RecheckForm
									check={check}
									draft={draft}
									setDraft={setDraft}
									showErrors={showErrors}
									validation={recheckValidation}
									isSubmitting={isSubmitting}
									onSubmit={handleSubmitRecheck}
									onCancel={requestClose}
								/>
							)}

							{phase === 'resolved' && (
								<div className="space-y-4">
									<p
										role="status"
										className="rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-900">
										This shift’s water temperature check is complete
										{status === 'complete_with_attention'
											? '. One or more readings were below 110°F and are flagged for management review.'
											: '.'}
									</p>
									<div className="flex justify-end">
										<button
											type="button"
											onClick={onClose}
											className={`${TOUCH_TARGET} rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus-visible:ring-blue-500`}>
											Done
										</button>
									</div>
								</div>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}

function successNotice(
	operation: 'create' | 'action' | 'recheck',
	result: WaterTemperatureCheckDto
): string {
	if (result.state === 'action_required') {
		return 'Your readings were saved exactly as measured. A reading is above 115°F — document the corrective action taken below.';
	}
	if (result.state === 'recheck_required') {
		return 'Recorded. Recheck each affected fixture until it reads within ' + SAFE_RANGE_LABEL + '.';
	}
	if (result.state === 'complete_with_attention') {
		return 'Recorded. A reading is below 110°F and is flagged for management review.';
	}
	return operation === 'create'
		? 'This shift’s water temperature check is complete.'
		: 'The obligation is now resolved for this shift.';
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ServerContextPanel({
	context,
}: {
	context: ReturnType<typeof deriveEntryContext>;
}) {
	return (
		<div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
			<dl className="grid grid-cols-1 gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
				<div className="flex justify-between sm:block">
					<dt className="font-medium text-gray-600">House</dt>
					<dd className="text-gray-900">{context.houseName}</dd>
				</div>
				<div className="flex justify-between sm:block">
					<dt className="font-medium text-gray-600">Date</dt>
					<dd className="text-gray-900">{context.operationalDate}</dd>
				</div>
				<div className="flex justify-between sm:block">
					<dt className="font-medium text-gray-600">Shift</dt>
					<dd className="text-gray-900">{context.shiftSlotLabel}</dd>
				</div>
				<div className="flex justify-between sm:block">
					<dt className="font-medium text-gray-600">Initials</dt>
					<dd className="text-gray-900">{context.initials}</dd>
				</div>
			</dl>
			<p className="mt-2 text-xs text-gray-600">{context.readOnlyNote}</p>
		</div>
	);
}

function ErrorSummary({issues}: {issues: FieldIssue[]}) {
	return (
		<div
			id={IDS.errorSummary}
			tabIndex={-1}
			role="alert"
			aria-labelledby={`${IDS.errorSummary}-title`}
			className="rounded-lg border-2 border-red-400 bg-red-50 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
			<p id={`${IDS.errorSummary}-title`} className="font-semibold text-red-900">
				{issues.length === 1
					? 'There is 1 problem with your entry'
					: `There are ${issues.length} problems with your entry`}
			</p>
			<ul className="mt-2 space-y-1 text-sm">
				{issues.map((issue) => (
					<li key={issue.fieldId}>
						<button
							type="button"
							onClick={() => document.getElementById(issue.fieldId)?.focus()}
							className="text-left text-red-900 underline focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
							{issue.message}
						</button>
					</li>
				))}
			</ul>
		</div>
	);
}

function OriginalReadings({check}: {check: WaterTemperatureCheckDto}) {
	const originals = deriveOriginalReadingSummary(check);
	const affected = deriveAffectedFixtures(check);
	return (
		<section aria-labelledby="water-temperature-original-heading" className="space-y-3">
			<h3
				id="water-temperature-original-heading"
				className="text-sm font-semibold text-gray-900">
				Recorded readings for this shift
			</h3>
			<ul className="space-y-2">
				{originals.map((entry) => (
					<li
						key={entry.fixture}
						className="flex flex-wrap items-baseline justify-between gap-2 rounded border border-gray-200 p-2 text-sm">
						<span className="font-medium text-gray-900">{entry.label}</span>
						<span className="text-gray-900">
							{entry.tempF.toFixed(1)}°F{' '}
							<span
								className={
									entry.classification === 'safe'
										? 'text-green-800'
										: entry.classification === 'below'
											? 'text-amber-900'
											: 'text-red-800 font-semibold'
								}>
								({entry.classificationLabel})
							</span>
						</span>
					</li>
				))}
			</ul>
			{affected.length > 0 && (
				<ul className="space-y-2 text-sm">
					{affected.map((fixture) => (
						<li key={fixture.fixture} className="rounded border border-red-200 bg-red-50 p-2">
							<p className="font-medium text-red-900">
								{fixture.label}: original {fixture.originalTempF.toFixed(1)}°F —{' '}
								{fixture.resolved ? 'resolved' : 'awaiting a safe recheck'}
							</p>
							{fixture.recheckHistory.length > 0 && (
								<ol className="mt-1 list-decimal pl-5 text-red-900">
									{fixture.recheckHistory.map((entry) => (
										<li key={entry.id}>
											{entry.tempF.toFixed(1)}°F by {entry.staffInitials} at{' '}
											{new Date(entry.measuredAt).toLocaleString()}
										</li>
									))}
								</ol>
							)}
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

function EscalationInstructions() {
	return (
		<div
			id={IDS.escalation}
			tabIndex={-1}
			role="alert"
			className="rounded-lg border-2 border-red-400 bg-red-50 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500">
			<p className="text-sm font-semibold text-red-900">Unsafe temperature — required steps</p>
			<p className="mt-1 text-sm text-red-900">{ABOVE_115_ESCALATION_INSTRUCTIONS}</p>
		</div>
	);
}

function PrivacyNotice({id}: {id: string}) {
	return (
		<p id={id} className="mt-1 text-xs text-gray-600">
			{NARRATIVE_PRIVACY_NOTICE}
		</p>
	);
}

function FieldError({fieldId, message}: {fieldId: string; message: string | null}) {
	if (!message) return null;
	return (
		<p id={errorId(fieldId)} className="mt-1 text-sm font-medium text-red-800">
			<span aria-hidden="true">⚠ </span>
			{message}
		</p>
	);
}

function TemperatureField({
	id,
	label,
	value,
	onChange,
	error,
	disabled,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (next: string) => void;
	error: string | null;
	disabled: boolean;
}) {
	const classification = classifyTypedTemperature(value);
	return (
		<div>
			<label htmlFor={id} className="block text-sm font-medium text-gray-700">
				{label} temperature (°F) <span className="text-red-700">*</span>
			</label>
			<input
				id={id}
				name={id}
				type="text"
				inputMode="decimal"
				autoComplete="off"
				value={value}
				disabled={disabled}
				onChange={(event) => onChange(event.target.value)}
				aria-required="true"
				aria-invalid={error ? true : undefined}
				aria-describedby={`${helpId(id)}${error ? ` ${errorId(id)}` : ''}`}
				className={`${FIELD_CLASSES} mt-1 ${error ? 'border-red-500' : 'border-gray-300'}`}
			/>
			<p id={helpId(id)} className="mt-1 text-xs text-gray-600">
				Degrees Fahrenheit, one decimal place. Safe range {SAFE_RANGE_LABEL}.
				{classification === 'above' && ' This value is above 115°F and will require corrective action.'}
				{classification === 'below' && ' This value is below 110°F and will be flagged for review.'}
			</p>
			<FieldError fieldId={id} message={error} />
		</div>
	);
}

function FormButtons({
	submitLabel,
	pendingLabel,
	canSubmit,
	isSubmitting,
	onCancel,
}: {
	submitLabel: string;
	pendingLabel: string;
	canSubmit: boolean;
	isSubmitting: boolean;
	onCancel: () => void;
}) {
	return (
		<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
			<button
				type="button"
				onClick={onCancel}
				disabled={isSubmitting}
				className={`${TOUCH_TARGET} rounded-lg border border-gray-300 px-4 py-2 font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50 focus-visible:ring-blue-500`}>
				Cancel
			</button>
			<button
				type="submit"
				disabled={!canSubmit || isSubmitting}
				className={`${TOUCH_TARGET} rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:ring-blue-500`}>
				{isSubmitting ? pendingLabel : submitLabel}
			</button>
		</div>
	);
}

type DraftSetter = React.Dispatch<React.SetStateAction<WaterTemperatureDraftBundle>>;

function InitialReadingsForm({
	draft,
	setDraft,
	showErrors,
	validation,
	isSubmitting,
	onSubmit,
	onCancel,
}: {
	draft: WaterTemperatureDraftBundle;
	setDraft: DraftSetter;
	showErrors: boolean;
	validation: ReturnType<typeof validateInitialReadings>;
	isSubmitting: boolean;
	onSubmit: (event: React.FormEvent) => void;
	onCancel: () => void;
}) {
	const errors = showErrors ? validation.fieldErrors : {kitchenTempF: null, bathTempF: null, comments: null};
	const remaining = remainingNarrativeCharacters(draft.initial.comments, MAX_COMMENT_LENGTH);
	return (
		<form onSubmit={onSubmit} noValidate className="space-y-4">
			<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
				<TemperatureField
					id={IDS.kitchen}
					label="Kitchen"
					value={draft.initial.kitchenTempF}
					onChange={(next) =>
						setDraft((current) => ({
							...current,
							initial: {...current.initial, kitchenTempF: next},
						}))
					}
					error={errors.kitchenTempF}
					disabled={isSubmitting}
				/>
				<TemperatureField
					id={IDS.bath}
					label="Bath / Shower"
					value={draft.initial.bathTempF}
					onChange={(next) =>
						setDraft((current) => ({
							...current,
							initial: {...current.initial, bathTempF: next},
						}))
					}
					error={errors.bathTempF}
					disabled={isSubmitting}
				/>
			</div>

			<div>
				<label htmlFor={IDS.comments} className="block text-sm font-medium text-gray-700">
					Comments / notes (optional)
				</label>
				<textarea
					id={IDS.comments}
					name={IDS.comments}
					rows={3}
					maxLength={MAX_COMMENT_LENGTH}
					value={draft.initial.comments}
					disabled={isSubmitting}
					onChange={(event) =>
						setDraft((current) => ({
							...current,
							initial: {...current.initial, comments: event.target.value},
						}))
					}
					aria-invalid={errors.comments ? true : undefined}
					aria-describedby={`${helpId(IDS.comments)}${errors.comments ? ` ${errorId(IDS.comments)}` : ''}`}
					className={`${FIELD_CLASSES} mt-1 ${errors.comments ? 'border-red-500' : 'border-gray-300'}`}
				/>
				<PrivacyNotice id={helpId(IDS.comments)} />
				<p className="mt-1 text-xs text-gray-500">{remaining} characters remaining.</p>
				<FieldError fieldId={IDS.comments} message={errors.comments} />
			</div>

			<p className="text-xs text-gray-600">
				Record the readings exactly as measured. A value outside {SAFE_RANGE_LABEL} is still
				saved as an operational fact.
			</p>

			<FormButtons
				submitLabel="Save readings"
				pendingLabel="Saving…"
				canSubmit={canSubmitInitialReadings({draft: draft.initial, isSubmitting})}
				isSubmitting={isSubmitting}
				onCancel={onCancel}
			/>
		</form>
	);
}

function ActionForm({
	draft,
	setDraft,
	showErrors,
	validation,
	isSubmitting,
	onSubmit,
	onCancel,
}: {
	draft: WaterTemperatureDraftBundle;
	setDraft: DraftSetter;
	showErrors: boolean;
	validation: ReturnType<typeof validateActionDraft>;
	isSubmitting: boolean;
	onSubmit: (event: React.FormEvent) => void;
	onCancel: () => void;
}) {
	const error = showErrors ? validation.fieldErrors.action : null;
	const remaining = remainingNarrativeCharacters(draft.action.action, MAX_ACTION_LENGTH);
	return (
		<form onSubmit={onSubmit} noValidate className="space-y-4">
			<EscalationInstructions />
			<div>
				<label htmlFor={IDS.action} className="block text-sm font-medium text-gray-700">
					Action taken <span className="text-red-700">*</span>
				</label>
				<textarea
					id={IDS.action}
					name={IDS.action}
					rows={4}
					maxLength={MAX_ACTION_LENGTH}
					value={draft.action.action}
					disabled={isSubmitting}
					onChange={(event) =>
						setDraft((current) => ({...current, action: {action: event.target.value}}))
					}
					aria-required="true"
					aria-invalid={error ? true : undefined}
					aria-describedby={`${helpId(IDS.action)}${error ? ` ${errorId(IDS.action)}` : ''}`}
					className={`${FIELD_CLASSES} mt-1 ${error ? 'border-red-500' : 'border-gray-300'}`}
				/>
				<PrivacyNotice id={helpId(IDS.action)} />
				<p className="mt-1 text-xs text-gray-500">{remaining} characters remaining.</p>
				<FieldError fieldId={IDS.action} message={error} />
			</div>
			<FormButtons
				submitLabel="Save action taken"
				pendingLabel="Saving…"
				canSubmit={canSubmitAction({draft: draft.action, isSubmitting})}
				isSubmitting={isSubmitting}
				onCancel={onCancel}
			/>
		</form>
	);
}

function RecheckForm({
	check,
	draft,
	setDraft,
	showErrors,
	validation,
	isSubmitting,
	onSubmit,
	onCancel,
}: {
	check: WaterTemperatureCheckDto;
	draft: WaterTemperatureDraftBundle;
	setDraft: DraftSetter;
	showErrors: boolean;
	validation: ReturnType<typeof validateRecheckDraft>;
	isSubmitting: boolean;
	onSubmit: (event: React.FormEvent) => void;
	onCancel: () => void;
}) {
	const errors = showErrors ? validation.fieldErrors : {fixture: null, tempF: null};
	const selectable = selectableRecheckFixtures(check);
	return (
		<form onSubmit={onSubmit} noValidate className="space-y-4">
			<EscalationInstructions />
			{check.action && (
				<p className="rounded border border-gray-200 bg-gray-50 p-2 text-sm text-gray-800">
					<span className="font-medium">Action already documented: </span>
					{check.action}
				</p>
			)}
			<div>
				<label htmlFor={IDS.recheckFixture} className="block text-sm font-medium text-gray-700">
					Fixture rechecked <span className="text-red-700">*</span>
				</label>
				<select
					id={IDS.recheckFixture}
					name={IDS.recheckFixture}
					value={draft.recheck.fixture}
					disabled={isSubmitting}
					onChange={(event) =>
						setDraft((current) => ({
							...current,
							recheck: {
								...current.recheck,
								fixture: event.target.value as typeof current.recheck.fixture,
							},
						}))
					}
					aria-required="true"
					aria-invalid={errors.fixture ? true : undefined}
					aria-describedby={errors.fixture ? errorId(IDS.recheckFixture) : undefined}
					className={`${FIELD_CLASSES} mt-1 bg-white ${errors.fixture ? 'border-red-500' : 'border-gray-300'}`}>
					<option value="">Select a fixture</option>
					{selectable.map((fixture) => (
						<option key={fixture.fixture} value={fixture.fixture}>
							{fixture.label} (original {fixture.originalTempF.toFixed(1)}°F)
						</option>
					))}
				</select>
				<FieldError fieldId={IDS.recheckFixture} message={errors.fixture} />
			</div>
			<TemperatureField
				id={IDS.recheckTemp}
				label="Recheck"
				value={draft.recheck.tempF}
				onChange={(next) =>
					setDraft((current) => ({...current, recheck: {...current.recheck, tempF: next}}))
				}
				error={errors.tempF}
				disabled={isSubmitting}
			/>
			<p className="text-xs text-gray-600">
				Rechecks are appended, never replaced. The original reading stays on the record.
			</p>
			<FormButtons
				submitLabel="Save recheck"
				pendingLabel="Saving…"
				canSubmit={canSubmitRecheck({draft: draft.recheck, isSubmitting})}
				isSubmitting={isSubmitting}
				onCancel={onCancel}
			/>
		</form>
	);
}
