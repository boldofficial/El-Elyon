// src/components/supervisor/WaterTemperatureWorkspace.tsx
//
// Monthly water-temperature management workspace (U5).
//
// Every decision this file renders -- the 31-row calendar projection, cell
// status and its colour-independent marker, summary counts, privileged-write
// validation, and conflict recovery -- comes from ./waterTemperatureModel and
// is asserted in waterTemperatureModel.test.ts. This component owns only the
// effects: fetching, printing, and dialog state.

'use client';

import React, {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import type {WaterTemperatureCheckDto} from '@/db/queries/water-temperature';
import {
	ABOVE_115_ESCALATION_INSTRUCTIONS,
	FIXTURE_LABELS,
	NARRATIVE_PRIVACY_NOTICE,
	SAFE_RANGE_LABEL,
	SHIFT_SLOT_LABELS,
} from '../care/waterTemperatureEntryModel';
import {lifeSafetyErrorMessage, readLifeSafetyResponse} from './lifeSafetyWorkspace';
import {printWaterTemperatureCheckLog} from './printWaterTemperatureReport';
import type {PrintableWaterTemperatureMonth} from './printWaterTemperatureReport';
import {
	WATER_TEMPERATURE_MONTH_NAMES,
	WATER_TEMPERATURE_SHIFT_SLOTS,
	WATER_TEMPERATURE_WORKSPACE_IDS,
	buildWaterTemperatureMonth,
	correctionDraftFromCheck,
	describeCell,
	emptyManualEntryDraft,
	formatTemperature,
	isValidReportMonth,
	isValidReportYear,
	isWaterTemperatureScopeReady,
	mapWorkspaceMutationFailure,
	partitionMonthRecords,
	sameWaterTemperatureScope,
	type CorrectionDraft,
	type ManualEntryDraft,
	type WaterTemperatureCellTone,
	type WaterTemperatureLoadState,
	type WaterTemperatureMonthCell,
	type WaterTemperatureScope,
	validateCorrectionDraft,
	validateManualEntryDraft,
	validateVoidDraft,
} from './waterTemperatureModel';
import type {ShiftSlot} from '@/lib/water-temperature';

type LocationOption = {id: string; name: string};

type EditorMode = 'correct' | 'manual' | 'void';

type EditorState = {
	scope: WaterTemperatureScope;
	date: string;
	slot: ShiftSlot;
	cell: WaterTemperatureMonthCell;
	mode: EditorMode;
};

const inputClass =
	'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100';

const TONE_CLASSES: Record<WaterTemperatureCellTone, string> = {
	muted: 'border-gray-200 bg-gray-50 text-gray-500',
	neutral: 'border-dashed border-gray-400 bg-white text-gray-700',
	positive: 'border-green-300 bg-green-50 text-green-900',
	attention: 'border-amber-400 bg-amber-50 text-amber-900',
	urgent: 'border-red-400 bg-red-50 text-red-900',
};

export default function WaterTemperatureWorkspace({canManage = false}: {canManage?: boolean}) {
	const now = new Date();
	const [locations, setLocations] = useState<LocationOption[]>([]);
	const [locationsState, setLocationsState] = useState<WaterTemperatureLoadState>('loading');
	const [selectedLocationId, setSelectedLocationId] = useState('');
	const [year, setYear] = useState(now.getFullYear());
	const [month, setMonth] = useState(now.getMonth() + 1);
	const [records, setRecords] = useState<WaterTemperatureCheckDto[]>([]);
	const [recordsState, setRecordsState] = useState<WaterTemperatureLoadState>('idle');
	const [recordsError, setRecordsError] = useState('');
	const [loadedScope, setLoadedScope] = useState<WaterTemperatureScope | null>(null);
	const [reloadToken, setReloadToken] = useState(0);
	const [editor, setEditor] = useState<EditorState | null>(null);
	const [correctionDraft, setCorrectionDraft] = useState<CorrectionDraft | null>(null);
	const [manualDraft, setManualDraft] = useState<ManualEntryDraft | null>(null);
	const [voidReason, setVoidReason] = useState('');
	const [saving, setSaving] = useState(false);
	const [conflictMessage, setConflictMessage] = useState('');
	const [printing, setPrinting] = useState(false);

	const selectedLocation = locations.find((location) => location.id === selectedLocationId);
	const validYear = isValidReportYear(year);
	const validMonth = isValidReportMonth(month);
	const currentScope: WaterTemperatureScope | null =
		selectedLocation && validYear && validMonth
			? {locationId: selectedLocation.id, year, month}
			: null;
	const recordsReady = isWaterTemperatureScopeReady({currentScope, loadedScope, recordsState});

	const view = useMemo(
		() =>
			buildWaterTemperatureMonth({
				year: validYear ? year : now.getFullYear(),
				month: validMonth ? month : 1,
				records: recordsReady ? records : [],
				todayLocalDate: localToday(),
			}),
		// `now` is only a fallback for an invalid selector value.
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[records, recordsReady, year, month, validYear, validMonth]
	);
	const activeRecords = useMemo(() => partitionMonthRecords(records).active, [records]);

	useEffect(() => {
		if (!canManage) return;
		let cancelled = false;
		async function loadLocations() {
			setLocationsState('loading');
			try {
				const response = await fetch('/api/documents/life-safety-locations', {cache: 'no-store'});
				const payload = await readLifeSafetyResponse<{data: LocationOption[]}>(response);
				if (cancelled) return;
				setLocations(payload.data);
				setSelectedLocationId((current) =>
					payload.data.some((location) => location.id === current)
						? current
						: (payload.data[0]?.id ?? '')
				);
				setLocationsState('ready');
			} catch (error) {
				if (cancelled) return;
				setLocationsState('error');
				toast.error(lifeSafetyErrorMessage(error, 'Could not load authorized houses'));
			}
		}
		void loadLocations();
		return () => {
			cancelled = true;
		};
	}, [canManage]);

	// A scope change abandons any open editor: it belongs to a house/month
	// that is no longer selected and must never submit against the new one.
	useEffect(() => {
		closeEditor(true);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedLocationId, year, month]);

	useEffect(() => {
		if (!currentScope) {
			setRecords([]);
			setLoadedScope(null);
			setRecordsError('');
			setRecordsState('idle');
			return;
		}
		const scope = currentScope;
		let cancelled = false;
		setRecords([]);
		setLoadedScope(null);

		async function loadRecords() {
			setRecordsState('loading');
			setRecordsError('');
			try {
				// includeVoided keeps the reasoned void history visible beside
				// the reopened (now Missing) cell; the model separates them.
				const params = new URLSearchParams({
					locationId: scope.locationId,
					year: String(scope.year),
					month: String(scope.month),
					includeVoided: 'true',
				});
				const response = await fetch(`/api/documents/water-temperature-checks?${params}`, {
					cache: 'no-store',
				});
				const payload = await readLifeSafetyResponse<{data: WaterTemperatureCheckDto[]}>(response);
				if (cancelled) return;
				setRecords(payload.data);
				setLoadedScope(scope);
				setRecordsState('ready');
			} catch (error) {
				if (cancelled) return;
				setRecordsError(lifeSafetyErrorMessage(error, 'Could not load water temperature records'));
				setRecordsState('error');
			}
		}
		void loadRecords();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [selectedLocationId, year, month, validYear, validMonth, reloadToken]);

	if (!canManage) {
		return <StaffPanel />;
	}

	if (locationsState === 'loading') {
		return <StatusPanel title="Loading houses…" detail="Checking your authorized houses." />;
	}
	if (locationsState === 'error') {
		return (
			<StatusPanel
				title="Houses could not be loaded"
				detail="Refresh the page to retry. Your access scope was not broadened."
				tone="error"
			/>
		);
	}
	if (locations.length === 0) {
		return (
			<StatusPanel
				title="No authorized houses"
				detail="Ask an administrator to assign at least one active house before reviewing water temperature logs."
			/>
		);
	}

	return (
		<div className="space-y-5">
			<header>
				<h2 className="text-2xl font-bold text-gray-900">Daily Water Temperature Check Log</h2>
				<p className="mt-1 text-gray-600">
					Safe water temperature is {SAFE_RANGE_LABEL}. Check and document water temperatures at
					the beginning of each shift.
				</p>
			</header>

			<section
				className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
				aria-labelledby="water-temperature-filters">
				<h3 id="water-temperature-filters" className="sr-only">
					House and month selection
				</h3>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="grid flex-1 gap-4 sm:grid-cols-3">
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="water-house">
								House
							</label>
							<select
								id="water-house"
								className={inputClass}
								value={selectedLocationId}
								onChange={(event) => setSelectedLocationId(event.target.value)}>
								{locations.map((location) => (
									<option key={location.id} value={location.id}>
										{location.name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="water-month">
								Month
							</label>
							<select
								id="water-month"
								className={inputClass}
								value={month}
								onChange={(event) => setMonth(Number(event.target.value))}>
								{WATER_TEMPERATURE_MONTH_NAMES.map((name, index) => (
									<option key={name} value={index + 1}>
										{name}
									</option>
								))}
							</select>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="water-year">
								Year
							</label>
							<input
								id="water-year"
								type="number"
								min={2020}
								max={2100}
								className={inputClass}
								value={year}
								onChange={(event) => setYear(Number(event.target.value))}
							/>
							{!validYear && (
								<p className="mt-1 text-xs text-red-700">Choose a year from 2020 through 2100.</p>
							)}
						</div>
					</div>
					<button
						type="button"
						onClick={() => void printReport()}
						disabled={!recordsReady || printing}
						className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">
						{printing ? 'Preparing sheet…' : 'Print monthly log'}
					</button>
				</div>
			</section>

			{recordsState === 'error' && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
					<p className="font-semibold">Water temperature records could not be loaded.</p>
					<p className="mt-1">{recordsError}</p>
					<button
						type="button"
						onClick={() => setReloadToken((value) => value + 1)}
						className="mt-3 font-medium underline">
						Try again
					</button>
				</div>
			)}

			{recordsReady && <MonthSummary summary={view.summary} monthLabel={view.monthLabel} />}

			<section
				className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm"
				aria-busy={!recordsReady && recordsState === 'loading'}>
				<div className="border-b border-gray-200 px-4 py-3">
					<h3 className="font-semibold text-gray-900">{view.monthLabel}</h3>
					<p className="mt-1 text-sm text-gray-600">
						Missing means a valid day with no recorded check. N/A means the date does not exist in
						this month and is never a missing obligation.
					</p>
				</div>
				{recordsReady ? (
					<div className="overflow-x-auto">
						<table className="min-w-[900px] table-fixed border-collapse text-left text-sm">
							<caption className="sr-only">
								Daily water temperature checks for {view.monthLabel} by 1st, 2nd, and 3rd shift
							</caption>
							<thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
								<tr>
									<th scope="col" className="w-20 border-b border-r border-gray-200 px-3 py-3">
										Date
									</th>
									{WATER_TEMPERATURE_SHIFT_SLOTS.map((slot) => (
										<th
											key={slot}
											scope="col"
											className="border-b border-r border-gray-200 px-3 py-3 last:border-r-0">
											{SHIFT_SLOT_LABELS[slot]}
										</th>
									))}
								</tr>
							</thead>
							<tbody>
								{view.rows.map((row) => (
									<tr key={row.day} className="align-top even:bg-gray-50/40">
										<th
											scope="row"
											className="border-b border-r border-gray-200 px-3 py-3 font-semibold text-gray-900">
											{row.dayLabel}
											{!row.existsInMonth && (
												<span className="mt-1 block text-xs font-normal text-gray-500">N/A</span>
											)}
										</th>
										{row.cells.map((cell) => (
											<td
												key={cell.slot}
												className="border-b border-r border-gray-200 p-2 last:border-r-0">
												<MonthCell cell={cell} onOpen={() => openCell(cell)} />
											</td>
										))}
									</tr>
								))}
							</tbody>
						</table>
					</div>
				) : recordsState === 'error' ? (
					<div className="p-8 text-center text-sm text-gray-600" role="status">
						<p className="font-semibold">No records are visible for the current house and month.</p>
						<p className="mt-1">Use the retry link above to reload the current scope.</p>
					</div>
				) : (
					<div className="p-8 text-center text-sm text-gray-600" role="status">
						Loading monthly water temperature records…
					</div>
				)}
			</section>

			<p className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900">
				{ABOVE_115_ESCALATION_INSTRUCTIONS}
			</p>

			{editor && currentScope && sameWaterTemperatureScope(editor.scope, currentScope) && recordsReady && (
				<CellEditor
					editor={editor}
					houseName={selectedLocation?.name ?? ''}
					correctionDraft={correctionDraft}
					manualDraft={manualDraft}
					voidReason={voidReason}
					saving={saving}
					conflictMessage={conflictMessage}
					onCorrectionChange={setCorrectionDraft}
					onManualChange={setManualDraft}
					onVoidReasonChange={setVoidReason}
					onModeChange={(mode) => setEditor({...editor, mode})}
					onSubmit={() => void submitEditor()}
					onClose={() => closeEditor(false)}
					onReload={() => {
						closeEditor(true);
						setReloadToken((value) => value + 1);
					}}
				/>
			)}
		</div>
	);

	function openCell(cell: WaterTemperatureMonthCell) {
		if (!currentScope || !recordsReady) return;
		if (!cell.date) return;
		if (!cell.canCorrect && !cell.canRecordManualEntry) return;
		setConflictMessage('');
		setVoidReason('');
		setCorrectionDraft(cell.check ? correctionDraftFromCheck(cell.check) : null);
		setManualDraft(cell.check ? null : emptyManualEntryDraft(cell.date));
		setEditor({
			scope: currentScope,
			date: cell.date,
			slot: cell.slot,
			cell,
			mode: cell.check ? 'correct' : 'manual',
		});
	}

	function closeEditor(force: boolean) {
		if (saving && !force) return;
		setEditor(null);
		setCorrectionDraft(null);
		setManualDraft(null);
		setVoidReason('');
		setConflictMessage('');
	}

	async function submitEditor() {
		if (!editor || !currentScope || saving) return;
		if (!sameWaterTemperatureScope(editor.scope, currentScope) || !recordsReady) return;

		const request = buildRequest();
		if (!request) return;

		setSaving(true);
		setConflictMessage('');
		let httpStatus: number | null = null;
		let body: unknown = null;
		try {
			const response = await fetch(request.url, {
				method: request.method,
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(request.payload),
			});
			httpStatus = response.status;
			body = await response.json().catch(() => null);
			if (response.ok) {
				toast.success(request.successMessage);
				closeEditor(true);
				setReloadToken((value) => value + 1);
				return;
			}
		} catch {
			httpStatus = null;
		} finally {
			setSaving(false);
		}

		const outcome = mapWorkspaceMutationFailure({
			operation: request.operation,
			httpStatus,
			body,
		});
		setConflictMessage(outcome.message);
		if (outcome.reload) setReloadToken((value) => value + 1);
		if (!outcome.preserveDraft) closeEditor(true);
	}

	function buildRequest():
		| {
				url: string;
				method: 'POST' | 'PATCH' | 'DELETE';
				payload: unknown;
				operation: 'correct' | 'manual-create' | 'void';
				successMessage: string;
			}
		| null {
		if (!editor) return null;
		const check = editor.cell.check;

		if (editor.mode === 'manual') {
			if (!manualDraft) return null;
			const validation = validateManualEntryDraft({
				draft: manualDraft,
				locationId: editor.scope.locationId,
				operationalDate: editor.date,
				shiftSlot: editor.slot,
			});
			if (!validation.isValid || !validation.values) {
				setConflictMessage(validation.summary.map((issue) => issue.message).join(' '));
				return null;
			}
			return {
				url: '/api/documents/water-temperature-checks',
				method: 'POST',
				payload: {source: 'manual', ...validation.values, idempotencyKey: mintIdempotencyKey('manual')},
				operation: 'manual-create',
				successMessage: 'Missing shift recorded with a reason',
			};
		}

		if (!check) return null;

		if (editor.mode === 'void') {
			const validation = validateVoidDraft({draft: {reason: voidReason}, expectedVersion: check.version});
			if (!validation.isValid || !validation.values) {
				setConflictMessage(validation.summary.map((issue) => issue.message).join(' '));
				return null;
			}
			return {
				url: `/api/documents/water-temperature-checks/${check.id}`,
				method: 'DELETE',
				payload: {...validation.values, idempotencyKey: mintIdempotencyKey('void')},
				operation: 'void',
				successMessage: 'Record voided; history retained and the shift is due again',
			};
		}

		if (!correctionDraft) return null;
		const validation = validateCorrectionDraft({
			draft: correctionDraft,
			expectedVersion: check.version,
		});
		if (!validation.isValid || !validation.values) {
			setConflictMessage(validation.summary.map((issue) => issue.message).join(' '));
			return null;
		}
		return {
			url: `/api/documents/water-temperature-checks/${check.id}`,
			method: 'PATCH',
			payload: {...validation.values, idempotencyKey: mintIdempotencyKey('correct')},
			operation: 'correct',
			successMessage: 'Correction saved; the prior values remain in revision history',
		};
	}

	async function printReport() {
		if (!selectedLocation || !recordsReady || printing) return;
		setPrinting(true);
		try {
			const printable: PrintableWaterTemperatureMonth = {
				houseName: selectedLocation.name,
				year,
				month,
				checks: activeRecords.map((record) => ({
					operationalDate: record.operationalDate,
					shiftSlot: record.shiftSlot,
					// The original observations, never a later safe recheck.
					kitchenTempF: record.kitchenTempF,
					bathTempF: record.bathTempF,
					staffInitials: record.staffInitials,
					comments: record.comments,
					action: record.action,
					state: record.state,
					rechecks: record.rechecks.map((recheck) => ({
						fixture: recheck.fixture,
						tempF: recheck.tempF,
						staffInitials: recheck.staffInitials,
						sequence: recheck.sequence,
						supersededAt: recheck.supersededAt,
						voidedAt: recheck.voidedAt,
					})),
				})),
			};
			await printWaterTemperatureCheckLog(printable);
		} catch (error) {
			toast.error(lifeSafetyErrorMessage(error, 'Could not open the printable log'));
		} finally {
			setPrinting(false);
		}
	}
}

// ============================================================================
// PRESENTATION
// ============================================================================

function MonthCell({cell, onOpen}: {cell: WaterTemperatureMonthCell; onOpen: () => void}) {
	const interactive = cell.canCorrect || cell.canRecordManualEntry;
	const content = (
		<>
			<div className="flex items-center justify-between gap-2">
				<span className="inline-flex items-center gap-1 text-xs font-semibold">
					<span aria-hidden="true">{cell.marker.symbol}</span>
					<span>{cell.marker.label}</span>
				</span>
				{cell.initials && <span className="text-xs text-gray-600">{cell.initials}</span>}
			</div>
			{cell.check && (
				<p className="mt-1 text-xs text-gray-700">
					{FIXTURE_LABELS.kitchen} {formatTemperature(cell.kitchenTempF)} ·{' '}
					{FIXTURE_LABELS.bath_shower} {formatTemperature(cell.bathTempF)}
				</p>
			)}
			{cell.unresolvedFixtures.length > 0 && (
				<p className="mt-1 text-xs font-semibold">
					Unresolved: {cell.unresolvedFixtures.map((fixture) => FIXTURE_LABELS[fixture]).join(', ')}
				</p>
			)}
			{cell.voidedHistory.length > 0 && (
				<p className="mt-1 text-xs text-gray-500">
					{cell.voidedHistory.length} voided record
					{cell.voidedHistory.length === 1 ? '' : 's'} in history
				</p>
			)}
		</>
	);

	if (!interactive) {
		return (
			<div className={`min-h-16 rounded-md border p-2 ${TONE_CLASSES[cell.marker.tone]}`}>
				<span className="sr-only">{describeCell(cell)}</span>
				<div aria-hidden="true">{content}</div>
			</div>
		);
	}

	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={describeCell(cell)}
			className={`min-h-16 w-full rounded-md border p-2 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 hover:border-blue-400 ${TONE_CLASSES[cell.marker.tone]}`}>
			{content}
		</button>
	);
}

function MonthSummary({
	summary,
	monthLabel,
}: {
	summary: ReturnType<typeof buildWaterTemperatureMonth>['summary'];
	monthLabel: string;
}) {
	const tiles = [
		{label: 'Complete', value: summary.complete},
		{label: 'Below range', value: summary.completeWithAttention},
		{label: 'Action required', value: summary.actionRequired},
		{label: 'Recheck required', value: summary.recheckRequired},
		{label: 'Missing', value: summary.missing},
		{label: 'Not yet due', value: summary.future},
		{label: 'Voided records', value: summary.voidedRecords},
	];
	return (
		<section
			className="grid gap-3 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:grid-cols-4 lg:grid-cols-7"
			aria-label={`Summary for ${monthLabel}`}>
			{tiles.map((tile) => (
				<div key={tile.label}>
					<div className="text-2xl font-bold text-gray-900">{tile.value}</div>
					<div className="text-xs uppercase tracking-wide text-gray-600">{tile.label}</div>
				</div>
			))}
			<p className="col-span-full text-xs text-gray-500">
				{summary.obligationCount} shift obligations across {summary.validDays} valid days.{' '}
				{summary.naDays > 0
					? `${summary.naDays} calendar row${summary.naDays === 1 ? '' : 's'} marked N/A.`
					: 'No N/A rows this month.'}
			</p>
		</section>
	);
}

function CellEditor(props: {
	editor: EditorState;
	houseName: string;
	correctionDraft: CorrectionDraft | null;
	manualDraft: ManualEntryDraft | null;
	voidReason: string;
	saving: boolean;
	conflictMessage: string;
	onCorrectionChange: (draft: CorrectionDraft) => void;
	onManualChange: (draft: ManualEntryDraft) => void;
	onVoidReasonChange: (reason: string) => void;
	onModeChange: (mode: EditorMode) => void;
	onSubmit: () => void;
	onClose: () => void;
	onReload: () => void;
}) {
	const ids = WATER_TEMPERATURE_WORKSPACE_IDS;
	const {cell} = props.editor;
	const check = cell.check;

	return (
		<div
			className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
			role="presentation">
			<div
				className="max-h-[95vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:max-w-2xl sm:rounded-xl"
				role="dialog"
				aria-modal="true"
				aria-labelledby="water-temperature-admin-title">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 id="water-temperature-admin-title" className="text-lg font-semibold text-gray-900">
							{check ? 'Review and correct' : 'Record a missing shift'}
						</h3>
						<p className="mt-1 text-sm text-gray-600">
							{props.houseName} · {props.editor.date} · {SHIFT_SLOT_LABELS[props.editor.slot]}
						</p>
					</div>
					<button
						type="button"
						onClick={props.onClose}
						disabled={props.saving}
						className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">
						Close
					</button>
				</div>

				{props.conflictMessage && (
					<div
						className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
						role="alert">
						<p>{props.conflictMessage}</p>
						<button type="button" onClick={props.onReload} className="mt-2 font-medium underline">
							Discard my values and reload the current record
						</button>
					</div>
				)}

				{check && (
					<div className="mt-4 rounded-md border border-gray-200 bg-gray-50 p-3 text-sm">
						<p className="font-semibold text-gray-900">
							Recorded observation ({cell.marker.symbol} {cell.marker.label})
						</p>
						<p className="mt-1 text-gray-700">
							{FIXTURE_LABELS.kitchen} {formatTemperature(cell.kitchenTempF)} ·{' '}
							{FIXTURE_LABELS.bath_shower} {formatTemperature(cell.bathTempF)} · initials{' '}
							{check.staffInitials} · version {check.version}
						</p>
						{check.action && <p className="mt-1 text-gray-700">Action: {check.action}</p>}
						{cell.activeRechecks.length > 0 && (
							<ol className="mt-2 list-decimal space-y-1 pl-5 text-gray-700">
								{cell.activeRechecks.map((recheck) => (
									<li key={recheck.id}>
										{FIXTURE_LABELS[recheck.fixture]} {recheck.tempF.toFixed(1)}°F ·{' '}
										{recheck.staffInitials} · {recheck.measuredAt}
									</li>
								))}
							</ol>
						)}
						{cell.supersededRechecks.length > 0 && (
							<details className="mt-2">
								<summary className="cursor-pointer text-gray-700">
									Superseded rechecks ({cell.supersededRechecks.length})
								</summary>
								<ul className="mt-1 space-y-1 pl-5 text-gray-600">
									{cell.supersededRechecks.map((recheck) => (
										<li key={recheck.id}>
											{FIXTURE_LABELS[recheck.fixture]} {recheck.tempF.toFixed(1)}°F ·{' '}
											{recheck.staffInitials}
											{recheck.supersededReason ? ` · ${recheck.supersededReason}` : ''}
										</li>
									))}
								</ul>
							</details>
						)}
					</div>
				)}

				{cell.voidedHistory.length > 0 && (
					<details className="mt-3 rounded-md border border-gray-200 p-3 text-sm">
						<summary className="cursor-pointer font-medium text-gray-800">
							Void history ({cell.voidedHistory.length})
						</summary>
						<ul className="mt-2 space-y-2 text-gray-600">
							{cell.voidedHistory.map((record) => (
								<li key={record.id}>
									Kitchen {record.kitchenTempF.toFixed(1)}°F · Bath/Shower{' '}
									{record.bathTempF.toFixed(1)}°F · voided {record.voidedAt} ·{' '}
									{record.voidReason ?? 'no reason recorded'}
								</li>
							))}
						</ul>
					</details>
				)}

				<form
					className="mt-5 space-y-4"
					onSubmit={(event) => {
						event.preventDefault();
						props.onSubmit();
					}}>
					{props.editor.mode === 'manual' && props.manualDraft && (
						<ManualFields draft={props.manualDraft} onChange={props.onManualChange} />
					)}
					{props.editor.mode === 'correct' && props.correctionDraft && (
						<CorrectionFields draft={props.correctionDraft} onChange={props.onCorrectionChange} />
					)}
					{props.editor.mode === 'void' && (
						<div>
							<label htmlFor={ids.voidReason} className="mb-1 block text-sm font-semibold text-red-900">
								Reason for voiding
							</label>
							<textarea
								id={ids.voidReason}
								rows={3}
								maxLength={1000}
								required
								className={inputClass}
								value={props.voidReason}
								onChange={(event) => props.onVoidReasonChange(event.target.value)}
							/>
							<p className="mt-2 text-xs text-red-800">
								The record and its revision history are retained. Voiding immediately reopens this
								house, date, and shift, so an active matching staff reminder returns.
							</p>
						</div>
					)}

					<div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
						<button
							type="button"
							onClick={props.onClose}
							disabled={props.saving}
							className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
							Cancel
						</button>
						<button
							type="submit"
							disabled={props.saving}
							className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300">
							{props.saving
								? 'Saving…'
								: props.editor.mode === 'manual'
									? 'Record missing shift'
									: props.editor.mode === 'void'
										? 'Confirm void'
										: 'Save correction'}
						</button>
					</div>
				</form>

				{check && props.editor.mode !== 'void' && (
					<div className="mt-4 border-t border-gray-200 pt-4">
						<button
							type="button"
							onClick={() => props.onModeChange('void')}
							className="text-sm font-medium text-red-700 hover:underline">
							Void this record…
						</button>
					</div>
				)}
				{check && props.editor.mode === 'void' && (
					<div className="mt-4 border-t border-gray-200 pt-4">
						<button
							type="button"
							onClick={() => props.onModeChange('correct')}
							className="text-sm font-medium text-gray-700 hover:underline">
							Back to correction
						</button>
					</div>
				)}
			</div>
		</div>
	);
}

function CorrectionFields({
	draft,
	onChange,
}: {
	draft: CorrectionDraft;
	onChange: (draft: CorrectionDraft) => void;
}) {
	const ids = WATER_TEMPERATURE_WORKSPACE_IDS;
	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2">
				<TemperatureField
					id={ids.kitchen}
					label={`${FIXTURE_LABELS.kitchen} (°F)`}
					value={draft.kitchenTempF}
					onChange={(value) => onChange({...draft, kitchenTempF: value})}
				/>
				<TemperatureField
					id={ids.bath}
					label={`${FIXTURE_LABELS.bath_shower} (°F)`}
					value={draft.bathTempF}
					onChange={(value) => onChange({...draft, bathTempF: value})}
				/>
			</div>
			<NarrativeField
				id={ids.comments}
				label="Comments / notes"
				value={draft.comments}
				maxLength={2000}
				onChange={(value) => onChange({...draft, comments: value})}
			/>
			<NarrativeField
				id={ids.action}
				label="Action taken"
				value={draft.action}
				maxLength={2000}
				onChange={(value) => onChange({...draft, action: value})}
			/>
			<NarrativeField
				id={ids.reason}
				label="Correction reason (required)"
				value={draft.reason}
				maxLength={1000}
				required
				onChange={(value) => onChange({...draft, reason: value})}
			/>
		</>
	);
}

function ManualFields({
	draft,
	onChange,
}: {
	draft: ManualEntryDraft;
	onChange: (draft: ManualEntryDraft) => void;
}) {
	const ids = WATER_TEMPERATURE_WORKSPACE_IDS;
	return (
		<>
			<div className="grid gap-4 sm:grid-cols-2">
				<TemperatureField
					id={ids.kitchen}
					label={`${FIXTURE_LABELS.kitchen} (°F)`}
					value={draft.kitchenTempF}
					onChange={(value) => onChange({...draft, kitchenTempF: value})}
				/>
				<TemperatureField
					id={ids.bath}
					label={`${FIXTURE_LABELS.bath_shower} (°F)`}
					value={draft.bathTempF}
					onChange={(value) => onChange({...draft, bathTempF: value})}
				/>
			</div>
			<div className="grid gap-4 sm:grid-cols-3">
				<div>
					<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={ids.staffName}>
						Recorded by
					</label>
					<input
						id={ids.staffName}
						className={inputClass}
						maxLength={255}
						value={draft.staffName}
						onChange={(event) => onChange({...draft, staffName: event.target.value})}
					/>
				</div>
				<div>
					<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={ids.staffInitials}>
						Initials
					</label>
					<input
						id={ids.staffInitials}
						className={inputClass}
						maxLength={10}
						value={draft.staffInitials}
						onChange={(event) => onChange({...draft, staffInitials: event.target.value})}
					/>
				</div>
				<div>
					<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={ids.observedAt}>
						Observed at
					</label>
					<input
						id={ids.observedAt}
						type="datetime-local"
						className={inputClass}
						value={draft.observedAt}
						onChange={(event) => onChange({...draft, observedAt: event.target.value})}
					/>
				</div>
			</div>
			<NarrativeField
				id={ids.comments}
				label="Comments / notes"
				value={draft.comments}
				maxLength={2000}
				onChange={(value) => onChange({...draft, comments: value})}
			/>
			<NarrativeField
				id={ids.reason}
				label="Manual entry reason (required)"
				value={draft.reason}
				maxLength={1000}
				required
				onChange={(value) => onChange({...draft, reason: value})}
			/>
		</>
	);
}

function TemperatureField({
	id,
	label,
	value,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (value: string) => void;
}) {
	return (
		<div>
			<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={id}>
				{label}
			</label>
			<input
				id={id}
				inputMode="decimal"
				className={inputClass}
				value={value}
				aria-describedby={`${id}-help`}
				onChange={(event) => onChange(event.target.value)}
			/>
			<p id={`${id}-help`} className="mt-1 text-xs text-gray-500">
				Safe range {SAFE_RANGE_LABEL}. One decimal place, for example 112.5.
			</p>
		</div>
	);
}

function NarrativeField({
	id,
	label,
	value,
	maxLength,
	required,
	onChange,
}: {
	id: string;
	label: string;
	value: string;
	maxLength: number;
	required?: boolean;
	onChange: (value: string) => void;
}) {
	return (
		<div>
			<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor={id}>
				{label}
			</label>
			<textarea
				id={id}
				rows={3}
				maxLength={maxLength}
				required={required}
				className={inputClass}
				aria-describedby={`${id}-help`}
				value={value}
				onChange={(event) => onChange(event.target.value)}
			/>
			<p id={`${id}-help`} className="mt-1 text-xs text-gray-500">
				{NARRATIVE_PRIVACY_NOTICE}
			</p>
		</div>
	);
}

function StaffPanel() {
	return (
		<div className="space-y-4">
			<header>
				<h2 className="text-2xl font-bold text-gray-900">Daily Water Temperature Check</h2>
				<p className="mt-1 text-gray-600">
					Safe water temperature is {SAFE_RANGE_LABEL}. Check and document water temperatures at
					the beginning of each shift.
				</p>
			</header>
			<div className="rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-sm">
				<p>
					Your current shift&rsquo;s check is recorded from the reminder banner at the top of the
					portal, which stays visible until the check is complete.
				</p>
				<p className="mt-2">
					Monthly review, correction, and printing are available to supervisors and administrators.
				</p>
			</div>
			<p className="rounded-lg border border-red-300 bg-red-50 p-3 text-xs text-red-900">
				{ABOVE_115_ESCALATION_INSTRUCTIONS}
			</p>
		</div>
	);
}

function StatusPanel({
	title,
	detail,
	tone = 'neutral',
}: {
	title: string;
	detail: string;
	tone?: 'neutral' | 'error';
}) {
	return (
		<div
			className={`rounded-lg border p-8 text-center ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-gray-200 bg-white text-gray-700'}`}
			role={tone === 'error' ? 'alert' : 'status'}>
			<p className="font-semibold">{title}</p>
			<p className="mt-1 text-sm">{detail}</p>
		</div>
	);
}

// ============================================================================
// HELPERS
// ============================================================================

/** Retry-safe identifier for a privileged write (R17): one attempt keeps one
 * key, so a retried or duplicated request cannot apply the change twice. */
function mintIdempotencyKey(prefix: 'manual' | 'correct' | 'void'): string {
	const random =
		globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function'
			? globalThis.crypto.randomUUID()
			: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
	return `${prefix}-${random}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 100);
}

function localToday(): string {
	const today = new Date();
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
