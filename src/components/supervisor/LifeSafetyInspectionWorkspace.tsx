'use client';

import {useUser} from '@clerk/nextjs';
import React, {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import {
	INSPECTION_EQUIPMENT,
	buildAnnualInspectionRows,
	formatLocalInspectionDate,
	initialsFromName,
	inspectionDateBounds,
	type InspectionEquipmentType,
	type InspectionOutcome,
	type LifeSafetyInspectionEntry,
} from './lifeSafetyInspectionModel';
import {printAnnualInspectionReport} from './printLifeSafetyReports';
import {
	collectLegacyPages,
	lifeSafetyErrorMessage,
	readLifeSafetyResponse,
} from './lifeSafetyWorkspace';

type LocationOption = {id: string; name: string};

type LegacySmokeCheck = {
	id: string;
	location: string;
	date: string;
	smokeStatus: string;
	coStatus: string;
	staffInitials: string;
	notes: string | null;
};

type EditorState = {
	month: number;
	equipmentType: InspectionEquipmentType;
	entry?: LifeSafetyInspectionEntry;
};

type EditorForm = {
	inspectionDate: string;
	staffInitials: string;
	outcome: InspectionOutcome;
	notes: string;
};

const inputClass =
	'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100';

export default function LifeSafetyInspectionWorkspace() {
	const {user} = useUser();
	const currentYear = new Date().getFullYear();
	const [locations, setLocations] = useState<LocationOption[]>([]);
	const [selectedLocationId, setSelectedLocationId] = useState('');
	const [year, setYear] = useState(currentYear);
	const [entries, setEntries] = useState<LifeSafetyInspectionEntry[]>([]);
	const [legacyRows, setLegacyRows] = useState<LegacySmokeCheck[]>([]);
	const [locationsState, setLocationsState] = useState<'loading' | 'ready' | 'error'>('loading');
	const [recordsState, setRecordsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
	const [recordsError, setRecordsError] = useState('');
	const [reloadToken, setReloadToken] = useState(0);
	const [editor, setEditor] = useState<EditorState | null>(null);
	const [editorForm, setEditorForm] = useState<EditorForm | null>(null);
	const [saving, setSaving] = useState(false);
	const [conflict, setConflict] = useState(false);
	const [voiding, setVoiding] = useState(false);
	const [voidReason, setVoidReason] = useState('');
	const [printing, setPrinting] = useState(false);

	const selectedLocation = locations.find((location) => location.id === selectedLocationId);
	const rows = useMemo(() => buildAnnualInspectionRows(entries), [entries]);
	const defaultInitials = initialsFromName(user?.fullName || user?.username || '');
	const validYear = Number.isInteger(year) && year >= 2020 && year <= 2100;

	useEffect(() => {
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
						: payload.data[0]?.id ?? ''
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
	}, []);

	useEffect(() => {
		if (!selectedLocation || !validYear) {
			setEntries([]);
			setLegacyRows([]);
			setRecordsState('idle');
			return;
		}
		const location = selectedLocation;

		let cancelled = false;
		async function loadRecords() {
			setRecordsState('loading');
			setRecordsError('');
			try {
				const [inspectionPayload, legacy] = await Promise.all([
					fetchInspections(location.id, year),
					fetchAllLegacyChecks(location.name, year),
				]);
				if (cancelled) return;
				setEntries(inspectionPayload);
				setLegacyRows(legacy);
				setRecordsState('ready');
			} catch (error) {
				if (cancelled) return;
				const message = lifeSafetyErrorMessage(error, 'Could not load inspection records');
				setRecordsError(message);
				setRecordsState('error');
			}
		}
		void loadRecords();
		return () => {
			cancelled = true;
		};
	}, [selectedLocation, validYear, year, reloadToken]);

	function openEditor(month: number, equipmentType: InspectionEquipmentType, entry?: LifeSafetyInspectionEntry) {
		const bounds = inspectionDateBounds(year, month);
		const today = localToday();
		setEditor({month, equipmentType, entry});
		setEditorForm({
			inspectionDate: entry?.inspectionDate ?? (today >= bounds.minimum && today <= bounds.maximum ? today : ''),
			staffInitials: entry?.staffInitials ?? defaultInitials,
			outcome: entry?.outcome ?? 'pass',
			notes: entry?.notes ?? '',
		});
		setConflict(false);
		setVoiding(false);
		setVoidReason('');
	}

	function closeEditor() {
		if (saving) return;
		setEditor(null);
		setEditorForm(null);
		setConflict(false);
		setVoiding(false);
		setVoidReason('');
	}

	async function saveEntry(event: React.FormEvent) {
		event.preventDefault();
		if (!editor || !editorForm || !selectedLocation) return;
		setSaving(true);
		setConflict(false);
		const entry = {
			locationId: selectedLocation.id,
			reportYear: year,
			reportMonth: editor.month,
			equipmentType: editor.equipmentType,
			inspectionDate: editorForm.inspectionDate,
			staffInitials: editorForm.staffInitials.trim(),
			outcome: editorForm.outcome,
			notes: editorForm.notes.trim() || null,
		};

		try {
			const isCorrection = Boolean(editor.entry);
			const response = await fetch(
				isCorrection
					? `/api/documents/life-safety-inspections/${editor.entry?.id}`
					: '/api/documents/life-safety-inspections',
				{
					method: isCorrection ? 'PATCH' : 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify(
						isCorrection
							? {expectedVersion: editor.entry?.version, entry}
							: entry
					),
				}
			);
			if (response.status === 409) {
				setConflict(true);
				return;
			}
			await readLifeSafetyResponse(response);
			toast.success(isCorrection ? 'Inspection corrected' : 'Inspection recorded');
			closeEditorAfterSave();
			setReloadToken((value) => value + 1);
		} catch (error) {
			toast.error(lifeSafetyErrorMessage(error, 'Could not save inspection'));
		} finally {
			setSaving(false);
		}
	}

	async function voidEntry() {
		if (!editor?.entry || voidReason.trim().length === 0) return;
		setSaving(true);
		setConflict(false);
		try {
			const response = await fetch(`/api/documents/life-safety-inspections/${editor.entry.id}`, {
				method: 'DELETE',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					expectedVersion: editor.entry.version,
					reason: voidReason.trim(),
				}),
			});
			if (response.status === 409) {
				setConflict(true);
				return;
			}
			await readLifeSafetyResponse(response);
			toast.success('Inspection voided; its audit history was retained');
			closeEditorAfterSave();
			setReloadToken((value) => value + 1);
		} catch (error) {
			toast.error(lifeSafetyErrorMessage(error, 'Could not void inspection'));
		} finally {
			setSaving(false);
		}
	}

	async function printReport() {
		if (!selectedLocation || !validYear || printing) return;
		setPrinting(true);
		try {
			await printAnnualInspectionReport({
				houseName: selectedLocation.name,
				year,
				entries: entries.map((entry) => ({
					reportMonth: entry.reportMonth,
					equipmentType: entry.equipmentType,
					inspectionDate: entry.inspectionDate,
					staffInitials: entry.staffInitials,
				})),
			});
		} catch (error) {
			toast.error(lifeSafetyErrorMessage(error, 'Could not open the print report'));
		} finally {
			setPrinting(false);
		}
	}

	if (locationsState === 'loading') {
		return <StatusPanel title="Loading houses…" detail="Checking your authorized life-safety locations." />;
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
				detail="Ask an administrator to assign at least one active house before recording inspections."
			/>
		);
	}

	return (
		<div className="space-y-5">
			<section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="inspection-filters-heading">
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="grid flex-1 gap-4 sm:grid-cols-2">
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="inspection-house">House</label>
							<select
								id="inspection-house"
								className={inputClass}
								value={selectedLocationId}
								onChange={(event) => setSelectedLocationId(event.target.value)}>
								{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
							</select>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="inspection-year">Reporting year</label>
							<input
								id="inspection-year"
								type="number"
								min={2020}
								max={2100}
								className={inputClass}
								value={year}
								onChange={(event) => setYear(Number(event.target.value))}
							/>
							{!validYear && <p className="mt-1 text-xs text-red-700">Choose a year from 2020 through 2100.</p>}
						</div>
					</div>
					<button
						type="button"
						onClick={() => void printReport()}
						disabled={!selectedLocation || !validYear || recordsState === 'loading' || printing}
						className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">
						{printing ? 'Preparing report…' : 'Print annual sheet'}
					</button>
				</div>
			</section>

			{recordsState === 'error' && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
					<p className="font-semibold">Inspection records could not be loaded.</p>
					<p className="mt-1">{recordsError}</p>
					<button type="button" onClick={() => setReloadToken((value) => value + 1)} className="mt-3 font-medium underline">Try again</button>
				</div>
			)}

			<section className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-busy={recordsState === 'loading'}>
				<div className="border-b border-gray-200 px-4 py-3">
					<h3 className="font-semibold text-gray-900">Annual inspection record</h3>
					<p className="mt-1 text-sm text-gray-600">Blank cells mean no inspection has been recorded. They are not failures.</p>
				</div>
				{recordsState === 'loading' ? (
					<div className="p-8 text-center text-sm text-gray-600" role="status">Loading annual inspection entries…</div>
				) : (
					<>
						<div className="hidden overflow-x-auto md:block">
							<table className="min-w-[980px] table-fixed border-collapse text-left text-sm">
								<caption className="sr-only">January through December smoke, carbon monoxide, and fire extinguisher inspections</caption>
								<thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
									<tr>
										<th scope="col" className="w-28 border-b border-r border-gray-200 px-4 py-3">Month</th>
										{INSPECTION_EQUIPMENT.map((equipment) => <th key={equipment.type} scope="col" className="border-b border-r border-gray-200 px-3 py-3 last:border-r-0">{equipment.label}</th>)}
									</tr>
								</thead>
								<tbody>
									{rows.map((row) => (
										<tr key={row.month} className="align-top even:bg-gray-50/40">
											<th scope="row" className="border-b border-r border-gray-200 px-4 py-4 font-semibold text-gray-900">{row.monthName}</th>
											{INSPECTION_EQUIPMENT.map((equipment) => (
												<td key={equipment.type} className="border-b border-r border-gray-200 p-2 last:border-r-0">
													<InspectionCell entry={row.entries[equipment.type]} label={equipment.label} onOpen={() => openEditor(row.month, equipment.type, row.entries[equipment.type])} />
												</td>
											))}
										</tr>
									))}
								</tbody>
							</table>
						</div>
						<div className="divide-y divide-gray-200 md:hidden">
							{rows.map((row) => (
								<section key={row.month} className="p-4" aria-labelledby={`inspection-month-${row.month}`}>
									<h4 id={`inspection-month-${row.month}`} className="mb-3 font-semibold text-gray-900">{row.monthName}</h4>
									<div className="space-y-2">
										{INSPECTION_EQUIPMENT.map((equipment) => <InspectionCell key={equipment.type} entry={row.entries[equipment.type]} label={equipment.label} onOpen={() => openEditor(row.month, equipment.type, row.entries[equipment.type])} />)}
									</div>
								</section>
							))}
						</div>
					</>
				)}
			</section>

			<LegacyHistory rows={legacyRows} loading={recordsState === 'loading'} />

			{editor && editorForm && selectedLocation && (
				<InspectionEditor
					editor={editor}
					form={editorForm}
					houseName={selectedLocation.name}
					year={year}
					saving={saving}
					conflict={conflict}
					voiding={voiding}
					voidReason={voidReason}
					onFormChange={setEditorForm}
					onSave={saveEntry}
					onClose={closeEditor}
					onReload={() => {
						closeEditorAfterSave();
						setReloadToken((value) => value + 1);
					}}
					onStartVoid={() => setVoiding(true)}
					onCancelVoid={() => {setVoiding(false); setVoidReason('');}}
					onVoidReasonChange={setVoidReason}
					onVoid={() => void voidEntry()}
				/>
			)}
		</div>
	);

	function closeEditorAfterSave() {
		setEditor(null);
		setEditorForm(null);
		setConflict(false);
		setVoiding(false);
		setVoidReason('');
	}
}

function InspectionCell({entry, label, onOpen}: {entry?: LifeSafetyInspectionEntry; label: string; onOpen: () => void}) {
	return (
		<button
			type="button"
			onClick={onOpen}
			aria-label={entry ? `Correct ${label} inspection from ${formatLocalInspectionDate(entry.inspectionDate)}` : `Record ${label} inspection`}
			className={`min-h-20 w-full rounded-md border p-3 text-left transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${entry ? 'border-gray-200 bg-white hover:border-blue-300' : 'border-dashed border-gray-300 bg-gray-50 text-gray-500 hover:border-blue-400 hover:text-blue-700'}`}>
			{entry ? (
				<>
					<div className="flex items-center justify-between gap-2">
						<span className="font-medium text-gray-900">{formatLocalInspectionDate(entry.inspectionDate)}</span>
						<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.outcome === 'fail' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{entry.outcome === 'fail' ? 'Failed' : 'Passed'}</span>
					</div>
					<p className="mt-1 text-xs text-gray-600">Initials: {entry.staffInitials}</p>
					{entry.notes && <p className="mt-1 line-clamp-2 text-xs text-gray-500">{entry.notes}</p>}
				</>
			) : <span className="text-sm font-medium">+ Record inspection</span>}
		</button>
	);
}

function InspectionEditor(props: {
	editor: EditorState;
	form: EditorForm;
	houseName: string;
	year: number;
	saving: boolean;
	conflict: boolean;
	voiding: boolean;
	voidReason: string;
	onFormChange: (form: EditorForm) => void;
	onSave: (event: React.FormEvent) => void;
	onClose: () => void;
	onReload: () => void;
	onStartVoid: () => void;
	onCancelVoid: () => void;
	onVoidReasonChange: (reason: string) => void;
	onVoid: () => void;
}) {
	const equipment = INSPECTION_EQUIPMENT.find((item) => item.type === props.editor.equipmentType)!;
	const monthName = new Date(Date.UTC(props.year, props.editor.month - 1, 1)).toLocaleString('en-US', {month: 'long', timeZone: 'UTC'});
	const bounds = inspectionDateBounds(props.year, props.editor.month);
	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation">
			<div className="max-h-[95vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:max-w-xl sm:rounded-xl" role="dialog" aria-modal="true" aria-labelledby="inspection-editor-title">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 id="inspection-editor-title" className="text-lg font-semibold text-gray-900">{props.editor.entry ? 'Correct' : 'Record'} {equipment.label.toLowerCase()}</h3>
						<p className="mt-1 text-sm text-gray-600">{props.houseName} · {monthName} {props.year}</p>
					</div>
					<button type="button" onClick={props.onClose} disabled={props.saving} className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">Close</button>
				</div>

				{props.conflict && (
					<div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
						<p className="font-semibold">Someone else changed this inspection.</p>
						<p className="mt-1">Your values remain in this form. Reload the latest record before deciding whether to apply another correction.</p>
						<button type="button" onClick={props.onReload} className="mt-2 font-medium underline">Discard my values and reload latest</button>
					</div>
				)}

				<form className="mt-5 space-y-4" onSubmit={props.onSave}>
					<div>
						<label htmlFor="inspection-date" className="mb-1 block text-sm font-medium text-gray-700">{equipment.dateLabel}</label>
						<input id="inspection-date" type="date" min={bounds.minimum} max={bounds.maximum} required className={inputClass} value={props.form.inspectionDate} onChange={(event) => props.onFormChange({...props.form, inspectionDate: event.target.value})} />
					</div>
					<div className="grid gap-4 sm:grid-cols-2">
						<div>
							<label htmlFor="inspection-initials" className="mb-1 block text-sm font-medium text-gray-700">Completed by (initials)</label>
							<input id="inspection-initials" maxLength={50} required className={inputClass} value={props.form.staffInitials} onChange={(event) => props.onFormChange({...props.form, staffInitials: event.target.value})} />
						</div>
						<div>
							<label htmlFor="inspection-outcome" className="mb-1 block text-sm font-medium text-gray-700">Outcome</label>
							<select id="inspection-outcome" className={inputClass} value={props.form.outcome} onChange={(event) => props.onFormChange({...props.form, outcome: event.target.value as InspectionOutcome})}>
								<option value="pass">Pass</option><option value="fail">Fail</option>
							</select>
						</div>
					</div>
					<div>
						<label htmlFor="inspection-notes" className="mb-1 block text-sm font-medium text-gray-700">Notes</label>
						<textarea id="inspection-notes" rows={4} maxLength={2000} className={inputClass} value={props.form.notes} onChange={(event) => props.onFormChange({...props.form, notes: event.target.value})} placeholder="Optional details retained in the digital record" />
					</div>
					<div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
						<button type="button" onClick={props.onClose} disabled={props.saving} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
						<button type="submit" disabled={props.saving || props.conflict} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300">{props.saving ? 'Saving…' : props.editor.entry ? 'Save correction' : 'Record inspection'}</button>
					</div>
				</form>

				{props.editor.entry && (
					<div className="mt-5 border-t border-gray-200 pt-4">
						{props.voiding ? (
							<div className="rounded-md border border-red-200 bg-red-50 p-3">
								<label htmlFor="inspection-void-reason" className="block text-sm font-semibold text-red-900">Reason for voiding</label>
								<textarea id="inspection-void-reason" rows={3} maxLength={1000} className={`${inputClass} mt-2`} value={props.voidReason} onChange={(event) => props.onVoidReasonChange(event.target.value)} required />
								<p className="mt-2 text-xs text-red-800">The record and revision history will be retained. A replacement may be recorded afterward.</p>
								<div className="mt-3 flex gap-2">
									<button type="button" onClick={props.onCancelVoid} disabled={props.saving} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">Cancel</button>
									<button type="button" onClick={props.onVoid} disabled={props.saving || props.voidReason.trim().length === 0 || props.conflict} className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:bg-gray-300">{props.saving ? 'Voiding…' : 'Confirm void'}</button>
								</div>
							</div>
						) : <button type="button" onClick={props.onStartVoid} className="text-sm font-medium text-red-700 hover:underline">Void this inspection…</button>}
					</div>
				)}
			</div>
		</div>
	);
}

function LegacyHistory({rows, loading}: {rows: LegacySmokeCheck[]; loading: boolean}) {
	return (
		<details className="rounded-lg border border-gray-200 bg-white shadow-sm">
			<summary className="cursor-pointer px-4 py-3 font-semibold text-gray-900">Legacy smoke and CO history ({loading ? '…' : rows.length})</summary>
			<div className="border-t border-gray-200 p-4">
				<p className="mb-3 text-sm text-gray-600">These original rows are read-only and remain separate from the new annual entries.</p>
				{loading ? <p className="py-4 text-sm text-gray-600" role="status">Loading all legacy pages…</p> : rows.length === 0 ? <p className="py-4 text-sm text-gray-600">No legacy checks were recorded for this house and year.</p> : (
					<div className="overflow-x-auto">
						<table className="min-w-[760px] text-left text-sm">
							<caption className="sr-only">Read-only legacy smoke detector and carbon monoxide checks</caption>
							<thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th scope="col" className="px-3 py-2">Date</th><th scope="col" className="px-3 py-2">Smoke</th><th scope="col" className="px-3 py-2">CO</th><th scope="col" className="px-3 py-2">Initials</th><th scope="col" className="px-3 py-2">Notes</th></tr></thead>
							<tbody className="divide-y divide-gray-200">{rows.map((row) => <tr key={row.id}><td className="px-3 py-3 text-gray-900">{formatLocalInspectionDate(row.date)}</td><td className="px-3 py-3"><LegacyStatus value={row.smokeStatus} /></td><td className="px-3 py-3"><LegacyStatus value={row.coStatus} /></td><td className="px-3 py-3 text-gray-700">{row.staffInitials || '—'}</td><td className="max-w-md whitespace-pre-wrap px-3 py-3 text-gray-600">{row.notes || '—'}</td></tr>)}</tbody>
						</table>
					</div>
				)}
			</div>
		</details>
	);
}

function LegacyStatus({value}: {value: string}) {
	const failed = value.toLowerCase() === 'fail';
	return <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${failed ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{value || '—'}</span>;
}

function StatusPanel({title, detail, tone = 'neutral'}: {title: string; detail: string; tone?: 'neutral' | 'error'}) {
	return <div className={`rounded-lg border p-8 text-center ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-gray-200 bg-white text-gray-700'}`} role={tone === 'error' ? 'alert' : 'status'}><p className="font-semibold">{title}</p><p className="mt-1 text-sm">{detail}</p></div>;
}

async function fetchInspections(locationId: string, year: number) {
	const params = new URLSearchParams({locationId, year: String(year)});
	const response = await fetch(`/api/documents/life-safety-inspections?${params}`, {cache: 'no-store'});
	const payload = await readLifeSafetyResponse<{data: LifeSafetyInspectionEntry[]}>(response);
	return payload.data;
}

async function fetchAllLegacyChecks(location: string, year: number) {
	return collectLegacyPages<LegacySmokeCheck>(async (cursor) => {
		const params = new URLSearchParams({location, year: String(year), limit: '100'});
		if (cursor) params.set('cursor', cursor);
		const response = await fetch(`/api/documents/smoke-detector-checks?${params}`, {cache: 'no-store'});
		return readLifeSafetyResponse<{data: LegacySmokeCheck[]; nextCursor: string | null}>(response);
	});
}

function localToday() {
	const today = new Date();
	return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
}
