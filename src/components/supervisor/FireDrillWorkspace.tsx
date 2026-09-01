'use client';

import React, {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import {
	FIRE_DRILL_SLOTS,
	collectLegacyPages,
	formatGatheringDuration,
	formatLocalFireDrillDate,
	formatLocalFireDrillTime,
	moveParticipant,
	participantDraftsFromReport,
	preserveUnavailableRosterSnapshots,
	reportForSequence,
	validateParticipantDrafts,
	validateStaffNames,
	type FireDrillReportRecord,
	type ParticipantDraft,
} from './fireDrillModel';
import {printFireDrillReport} from './printLifeSafetyReports';

type LocationOption = {id: string; name: string};
type ResidentOption = {id: string; name: string};

type LegacyFireDrill = {
	id: string;
	location: string;
	year: number;
	sequence: number;
	residentName: string;
	date: string;
	time: string;
	staffName: string;
	comment: string | null;
};

type EditorState = {
	sequence: 1 | 2;
	report?: FireDrillReportRecord;
};

type EditorForm = {
	drillDate: string;
	drillTime: string;
	staffNames: string[];
	participants: ParticipantDraft[];
};

const inputClass =
	'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100';

export default function FireDrillWorkspace() {
	const currentYear = new Date().getFullYear();
	const [locations, setLocations] = useState<LocationOption[]>([]);
	const [selectedLocationId, setSelectedLocationId] = useState('');
	const [year, setYear] = useState(currentYear);
	const [reports, setReports] = useState<FireDrillReportRecord[]>([]);
	const [residents, setResidents] = useState<ResidentOption[]>([]);
	const [legacyRows, setLegacyRows] = useState<LegacyFireDrill[]>([]);
	const [locationsState, setLocationsState] = useState<'loading' | 'ready' | 'error'>('loading');
	const [recordsState, setRecordsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
	const [recordsError, setRecordsError] = useState('');
	const [reloadToken, setReloadToken] = useState(0);
	const [editor, setEditor] = useState<EditorState | null>(null);
	const [editorForm, setEditorForm] = useState<EditorForm | null>(null);
	const [residentToAdd, setResidentToAdd] = useState('');
	const [formErrors, setFormErrors] = useState<string[]>([]);
	const [saving, setSaving] = useState(false);
	const [conflict, setConflict] = useState(false);
	const [voiding, setVoiding] = useState(false);
	const [voidReason, setVoidReason] = useState('');
	const [printing, setPrinting] = useState(false);

	const selectedLocation = locations.find((location) => location.id === selectedLocationId);
	const validYear = Number.isInteger(year) && year >= 2020 && year <= 2100;
	const residentIds = useMemo(() => new Set(residents.map((resident) => resident.id)), [residents]);

	useEffect(() => {
		let cancelled = false;
		async function loadLocations() {
			setLocationsState('loading');
			try {
				const response = await fetch('/api/documents/life-safety-locations', {cache: 'no-store'});
				const payload = await readResponse<{data: LocationOption[]}>(response);
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
				toast.error(errorMessage(error, 'Could not load authorized houses'));
			}
		}
		void loadLocations();
		return () => {
			cancelled = true;
		};
	}, []);

	useEffect(() => {
		if (!selectedLocation || !validYear) {
			setReports([]);
			setResidents([]);
			setLegacyRows([]);
			setRecordsState('idle');
			return;
		}
		const location = selectedLocation;
		let cancelled = false;
		async function loadRecords() {
			setRecordsState('loading');
			setRecordsError('');
			setReports([]);
			setResidents([]);
			setLegacyRows([]);
			try {
				const [currentReports, authorizedResidents, legacy] = await Promise.all([
					fetchFireDrillReports(location.id, year),
					fetchResidents(location.id),
					fetchAllLegacyDrills(location.name, year),
				]);
				if (cancelled) return;
				setReports(currentReports);
				setResidents(authorizedResidents);
				setLegacyRows(legacy);
				setRecordsState('ready');
			} catch (error) {
				if (cancelled) return;
				setRecordsError(errorMessage(error, 'Could not load fire drill records'));
				setRecordsState('error');
			}
		}
		void loadRecords();
		return () => {
			cancelled = true;
		};
	}, [selectedLocation, validYear, year, reloadToken]);

	function openEditor(sequence: 1 | 2, report?: FireDrillReportRecord) {
		setEditor({sequence, report});
		setEditorForm({
			drillDate: report?.drillDate ?? '',
			drillTime: report?.drillTime?.slice(0, 5) ?? '',
			staffNames: report ? [...report.staffNames] : [''],
			participants: report
				? preserveUnavailableRosterSnapshots(participantDraftsFromReport(report), residentIds)
				: [],
		});
		setResidentToAdd('');
		setFormErrors([]);
		setConflict(false);
		setVoiding(false);
		setVoidReason('');
	}

	function closeEditor() {
		if (saving) return;
		closeEditorAfterSave();
	}

	function addResident() {
		if (!editorForm || !residentToAdd) return;
		const resident = residents.find((candidate) => candidate.id === residentToAdd);
		if (!resident || editorForm.participants.some((participant) => participant.residentId === resident.id)) return;
		setEditorForm({
			...editorForm,
			participants: [
				...editorForm.participants,
				{
					key: newDraftKey(),
					residentId: resident.id,
					residentNameSnapshot: resident.name,
					participantSource: 'roster',
					durationMinutes: '',
					durationSeconds: '',
					comment: '',
				},
			],
		});
		setResidentToAdd('');
	}

	function updateParticipant(index: number, changes: Partial<ParticipantDraft>) {
		if (!editorForm) return;
		setEditorForm({
			...editorForm,
			participants: editorForm.participants.map((participant, participantIndex) =>
				participantIndex === index ? {...participant, ...changes} : participant
			),
		});
	}

	async function saveReport(event: React.FormEvent) {
		event.preventDefault();
		if (!editor || !editorForm || !selectedLocation) return;
		const participantResult = validateParticipantDrafts(editorForm.participants);
		const staffResult = validateStaffNames(editorForm.staffNames);
		const errors = [...staffResult.errors, ...participantResult.errors];
		if (!/^\d{4}-\d{2}-\d{2}$/.test(editorForm.drillDate) || Number(editorForm.drillDate.slice(0, 4)) !== year) {
			errors.unshift('The actual drill date must be in the selected reporting year.');
		}
		if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(editorForm.drillTime)) {
			errors.unshift('Enter the actual drill time.');
		}
		setFormErrors(errors);
		if (errors.length > 0) return;

		setSaving(true);
		setConflict(false);
		const report = {
			locationId: selectedLocation.id,
			reportYear: year,
			sequence: editor.sequence,
			drillDate: editorForm.drillDate,
			drillTime: editorForm.drillTime,
			staffNames: staffResult.staffNames,
			participants: participantResult.participants.map(({id: _id, ...participant}) => participant),
		};
		try {
			const isCorrection = Boolean(editor.report);
			const response = await fetch(
				isCorrection
					? `/api/documents/fire-drill-reports/${editor.report?.id}`
					: '/api/documents/fire-drill-reports',
				{
					method: isCorrection ? 'PATCH' : 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify(
						isCorrection
							? {expectedVersion: editor.report?.version, report}
							: report
					),
				}
			);
			if (response.status === 409) {
				setConflict(true);
				return;
			}
			await readResponse(response);
			toast.success(isCorrection ? 'Fire drill corrected' : 'Fire drill recorded');
			closeEditorAfterSave();
			setReloadToken((value) => value + 1);
		} catch (error) {
			setFormErrors([errorMessage(error, 'Could not save the fire drill')]);
		} finally {
			setSaving(false);
		}
	}

	async function voidReport() {
		if (!editor?.report || !voidReason.trim()) return;
		setSaving(true);
		setConflict(false);
		try {
			const response = await fetch(`/api/documents/fire-drill-reports/${editor.report.id}`, {
				method: 'DELETE',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					expectedVersion: editor.report.version,
					reason: voidReason.trim(),
				}),
			});
			if (response.status === 409) {
				setConflict(true);
				return;
			}
			await readResponse(response);
			toast.success('Fire drill voided; its event facts and revision history were retained');
			closeEditorAfterSave();
			setReloadToken((value) => value + 1);
		} catch (error) {
			setFormErrors([errorMessage(error, 'Could not void the fire drill')]);
		} finally {
			setSaving(false);
		}
	}

	async function printReport() {
		if (!selectedLocation || !validYear || printing) return;
		setPrinting(true);
		try {
			await printFireDrillReport({
				houseName: selectedLocation.name,
				year,
				reports: reports.map((report) => ({
					sequence: report.sequence,
					drillDate: report.drillDate,
					drillTime: report.drillTime,
					staffNames: report.staffNames,
					participants: report.participants.map((participant) => ({
						residentNameSnapshot: participant.residentNameSnapshot,
						durationMinutes: participant.durationMinutes,
						durationSeconds: participant.durationSeconds,
						comment: participant.comment,
						position: participant.position,
					})),
				})),
			});
		} catch (error) {
			toast.error(errorMessage(error, 'Could not open the fire drill report'));
		} finally {
			setPrinting(false);
		}
	}

	if (locationsState === 'loading') {
		return <StatusPanel title="Loading houses…" detail="Checking your authorized fire-drill locations." />;
	}
	if (locationsState === 'error') {
		return <StatusPanel title="Houses could not be loaded" detail="Refresh the page to retry. Your access scope was not broadened." tone="error" />;
	}
	if (locations.length === 0) {
		return <StatusPanel title="No authorized houses" detail="Ask an administrator to assign at least one active house before recording fire drills." />;
	}

	return (
		<div className="space-y-5">
			<section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm" aria-labelledby="fire-drill-filters-heading">
				<h3 id="fire-drill-filters-heading" className="sr-only">Fire drill report filters</h3>
				<div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
					<div className="grid flex-1 gap-4 sm:grid-cols-2">
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="fire-drill-house">House</label>
							<select id="fire-drill-house" className={inputClass} value={selectedLocationId} onChange={(event) => setSelectedLocationId(event.target.value)}>
								{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}
							</select>
						</div>
						<div>
							<label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="fire-drill-year">Reporting year</label>
							<input id="fire-drill-year" type="number" min={2020} max={2100} className={inputClass} value={year} onChange={(event) => setYear(Number(event.target.value))} />
							{!validYear && <p className="mt-1 text-xs text-red-700">Choose a year from 2020 through 2100.</p>}
						</div>
					</div>
					<button type="button" onClick={() => void printReport()} disabled={!selectedLocation || !validYear || recordsState !== 'ready' || printing} className="inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300">
						{printing ? 'Preparing report…' : 'Print fire drill sheet'}
					</button>
				</div>
			</section>

			{recordsState === 'error' && (
				<div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900" role="alert">
					<p className="font-semibold">Fire drill records could not be loaded.</p>
					<p className="mt-1">{recordsError}</p>
					<button type="button" onClick={() => setReloadToken((value) => value + 1)} className="mt-3 font-medium underline">Try again</button>
				</div>
			)}

			<section className="rounded-lg border border-gray-200 bg-white shadow-sm" aria-busy={recordsState === 'loading'} aria-labelledby="fire-drill-events-heading">
				<div className="border-b border-gray-200 px-4 py-3">
					<h3 id="fire-drill-events-heading" className="font-semibold text-gray-900">Fire drill events</h3>
					<p className="mt-1 text-sm text-gray-600">Record the actual event facts once, including everyone present and each resident result.</p>
				</div>
				{recordsState === 'loading' ? (
					<div className="p-8 text-center text-sm text-gray-600" role="status">Loading both fire drill slots and the full legacy history…</div>
				) : recordsState === 'error' ? (
					<div className="p-8 text-center text-sm text-gray-600">Event actions are unavailable until the records load successfully.</div>
				) : recordsState === 'idle' ? (
					<div className="p-8 text-center text-sm text-gray-600">Choose a valid reporting year to view the two fire drill slots.</div>
				) : (
					<div className="grid gap-4 p-4 lg:grid-cols-2">
						{FIRE_DRILL_SLOTS.map((slot) => {
							const report = reportForSequence(reports, slot.sequence);
							return <FireDrillSlot key={slot.sequence} sequence={slot.sequence} label={slot.label} report={report} onOpen={() => openEditor(slot.sequence, report)} />;
						})}
					</div>
				)}
			</section>

			{recordsState !== 'error' && <LegacyHistory rows={legacyRows} loading={recordsState === 'loading'} />}

			{editor && editorForm && selectedLocation && (
				<FireDrillEditor
					editor={editor}
					form={editorForm}
					houseName={selectedLocation.name}
					year={year}
					residents={residents}
					residentToAdd={residentToAdd}
					formErrors={formErrors}
					saving={saving}
					conflict={conflict}
					voiding={voiding}
					voidReason={voidReason}
					onFormChange={setEditorForm}
					onResidentToAddChange={setResidentToAdd}
					onAddResident={addResident}
					onUpdateParticipant={updateParticipant}
					onSave={saveReport}
					onClose={closeEditor}
					onReload={() => {
						closeEditorAfterSave();
						setReloadToken((value) => value + 1);
					}}
					onStartVoid={() => setVoiding(true)}
					onCancelVoid={() => {setVoiding(false); setVoidReason('');}}
					onVoidReasonChange={setVoidReason}
					onVoid={() => void voidReport()}
				/>
			)}
		</div>
	);

	function closeEditorAfterSave() {
		setEditor(null);
		setEditorForm(null);
		setResidentToAdd('');
		setFormErrors([]);
		setConflict(false);
		setVoiding(false);
		setVoidReason('');
	}
}

function FireDrillSlot({sequence, label, report, onOpen}: {sequence: 1 | 2; label: string; report?: FireDrillReportRecord; onOpen: () => void}) {
	return (
		<article className={`rounded-lg border p-4 ${report ? 'border-gray-200 bg-white' : 'border-dashed border-gray-300 bg-gray-50'}`} aria-labelledby={`fire-drill-slot-${sequence}`}>
			<div className="flex items-start justify-between gap-3">
				<div>
					<p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Sequence {sequence}</p>
					<h4 id={`fire-drill-slot-${sequence}`} className="mt-1 font-semibold text-gray-900">{label}</h4>
				</div>
				<button type="button" onClick={onOpen} className={`rounded-md px-3 py-2 text-sm font-medium ${report ? 'border border-gray-300 text-gray-800 hover:bg-gray-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
					{report ? 'Correct report' : 'Record event'}
				</button>
			</div>
			{report ? (
				<div className="mt-4 space-y-3 text-sm">
					<div className="grid gap-3 sm:grid-cols-2">
						<div><span className="block text-xs font-medium uppercase text-gray-500">Actual date and time</span><span className="text-gray-900">{formatLocalFireDrillDate(report.drillDate)} · {formatLocalFireDrillTime(report.drillTime)}</span></div>
						<div><span className="block text-xs font-medium uppercase text-gray-500">Staff present</span><span className="text-gray-900">{report.staffNames.join(', ')}</span></div>
					</div>
					<div>
						<span className="block text-xs font-medium uppercase text-gray-500">Resident results ({report.participants.length})</span>
						<ul className="mt-1 divide-y divide-gray-100 rounded-md border border-gray-200">
							{[...report.participants].sort((left, right) => left.position - right.position).map((participant) => (
								<li key={participant.id ?? `${report.id}-${participant.position}`} className="flex flex-col gap-1 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
									<span className="font-medium text-gray-900">{participant.residentNameSnapshot}</span>
									<span className="text-gray-600">{formatGatheringDuration(participant.durationMinutes, participant.durationSeconds)}</span>
								</li>
							))}
						</ul>
					</div>
				</div>
			) : <p className="mt-5 text-sm text-gray-600">No event is recorded. The printed sheet will keep this section blank.</p>}
		</article>
	);
}

function FireDrillEditor(props: {
	editor: EditorState;
	form: EditorForm;
	houseName: string;
	year: number;
	residents: ResidentOption[];
	residentToAdd: string;
	formErrors: string[];
	saving: boolean;
	conflict: boolean;
	voiding: boolean;
	voidReason: string;
	onFormChange: (form: EditorForm) => void;
	onResidentToAddChange: (id: string) => void;
	onAddResident: () => void;
	onUpdateParticipant: (index: number, changes: Partial<ParticipantDraft>) => void;
	onSave: (event: React.FormEvent) => void;
	onClose: () => void;
	onReload: () => void;
	onStartVoid: () => void;
	onCancelVoid: () => void;
	onVoidReasonChange: (reason: string) => void;
	onVoid: () => void;
}) {
	const slot = FIRE_DRILL_SLOTS.find((candidate) => candidate.sequence === props.editor.sequence)!;
	const selectedRosterIds = new Set(props.form.participants.map((participant) => participant.residentId).filter(Boolean));
	const availableResidents = props.residents.filter((resident) => !selectedRosterIds.has(resident.id));
	const minimumDate = `${props.year}-01-01`;
	const maximumDate = `${props.year}-12-31`;

	function updateStaff(index: number, value: string) {
		props.onFormChange({...props.form, staffNames: props.form.staffNames.map((name, nameIndex) => nameIndex === index ? value : name)});
	}

	function moveStaff(from: number, to: number) {
		props.onFormChange({...props.form, staffNames: moveParticipant(props.form.staffNames, from, to)});
	}

	function moveResident(from: number, to: number) {
		props.onFormChange({...props.form, participants: moveParticipant(props.form.participants, from, to)});
	}

	return (
		<div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="presentation">
			<div className="max-h-[96vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-xl sm:max-w-4xl sm:rounded-xl" role="dialog" aria-modal="true" aria-labelledby="fire-drill-editor-title">
				<div className="flex items-start justify-between gap-4">
					<div>
						<h3 id="fire-drill-editor-title" className="text-lg font-semibold text-gray-900">{props.editor.report ? 'Correct' : 'Record'} {slot.label.toLowerCase()}</h3>
						<p className="mt-1 text-sm text-gray-600">{props.houseName} · {props.year} · Sequence {props.editor.sequence}</p>
					</div>
					<button type="button" onClick={props.onClose} disabled={props.saving} className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-gray-100">Close</button>
				</div>

				{props.conflict && (
					<div className="mt-4 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="alert">
						<p className="font-semibold">This fire drill changed while you were editing.</p>
						<p className="mt-1">Your entered values remain here. Reload the latest event before deciding whether to make another correction.</p>
						<button type="button" onClick={props.onReload} className="mt-2 font-medium underline">Discard my values and reload latest</button>
					</div>
				)}

				{props.formErrors.length > 0 && (
					<div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">
						<p className="font-semibold">Review this event before saving:</p>
						<ul className="mt-1 list-disc space-y-1 pl-5">{props.formErrors.map((error, index) => <li key={`${error}-${index}`}>{error}</li>)}</ul>
					</div>
				)}

				<form className="mt-5 space-y-6" onSubmit={props.onSave}>
					<fieldset className="grid gap-4 sm:grid-cols-2">
						<legend className="col-span-full text-sm font-semibold text-gray-900">Actual event date and time</legend>
						<div>
							<label htmlFor="fire-drill-date" className="mb-1 block text-sm font-medium text-gray-700">Drill date</label>
							<input id="fire-drill-date" type="date" min={minimumDate} max={maximumDate} required className={inputClass} value={props.form.drillDate} onChange={(event) => props.onFormChange({...props.form, drillDate: event.target.value})} />
						</div>
						<div>
							<label htmlFor="fire-drill-time" className="mb-1 block text-sm font-medium text-gray-700">Drill time</label>
							<input id="fire-drill-time" type="time" required className={inputClass} value={props.form.drillTime} onChange={(event) => props.onFormChange({...props.form, drillTime: event.target.value})} />
						</div>
					</fieldset>

					<fieldset>
						<div className="flex items-center justify-between gap-3">
							<legend className="text-sm font-semibold text-gray-900">Staff present</legend>
							<button type="button" onClick={() => props.onFormChange({...props.form, staffNames: [...props.form.staffNames, '']})} disabled={props.form.staffNames.length >= 24} className="text-sm font-medium text-blue-700 hover:underline disabled:text-gray-400">+ Add staff member</button>
						</div>
						<div className="mt-2 space-y-2">
							{props.form.staffNames.map((name, index) => (
								<div key={index} className="flex items-center gap-2">
									<label className="sr-only" htmlFor={`fire-drill-staff-${index}`}>Staff member {index + 1}</label>
									<input id={`fire-drill-staff-${index}`} maxLength={255} required className={inputClass} value={name} onChange={(event) => updateStaff(index, event.target.value)} placeholder={`Staff member ${index + 1}`} />
									<OrderButtons label={`staff member ${index + 1}`} index={index} count={props.form.staffNames.length} onMove={moveStaff} />
									<button type="button" onClick={() => props.onFormChange({...props.form, staffNames: props.form.staffNames.filter((_, nameIndex) => nameIndex !== index)})} className="rounded-md px-2 py-2 text-sm font-medium text-red-700 hover:bg-red-50" aria-label={`Remove staff member ${index + 1}`}>Remove</button>
								</div>
							))}
						</div>
					</fieldset>

					<fieldset>
						<legend className="text-sm font-semibold text-gray-900">Resident evacuation results</legend>
						<div className="mt-2 flex flex-col gap-2 sm:flex-row">
							<label className="sr-only" htmlFor="fire-drill-add-resident">Authorized house resident</label>
							<select id="fire-drill-add-resident" className={inputClass} value={props.residentToAdd} onChange={(event) => props.onResidentToAddChange(event.target.value)}>
								<option value="">Choose an authorized resident…</option>
								{availableResidents.map((resident) => <option key={resident.id} value={resident.id}>{resident.name}</option>)}
							</select>
							<button type="button" onClick={props.onAddResident} disabled={!props.residentToAdd} className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-300">Add resident</button>
						</div>
						{props.residents.length === 0 && <p className="mt-2 text-xs text-amber-800">No active residents are available for this house.</p>}
						{props.form.participants.length === 0 ? (
							<p className="mt-3 rounded-md border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-600">No resident results have been added.</p>
						) : (
							<div className="mt-3 space-y-3">
								{props.form.participants.map((participant, index) => (
									<article key={participant.key} className="rounded-lg border border-gray-200 p-3" aria-labelledby={`fire-drill-participant-${participant.key}`}>
										<div className="flex flex-wrap items-start justify-between gap-2">
											<div>
												<h4 id={`fire-drill-participant-${participant.key}`} className="font-medium text-gray-900">{participant.residentNameSnapshot || `Resident ${index + 1}`}</h4>
												<p className="text-xs text-gray-500">{participant.participantSource === 'roster' ? 'Authorized roster resident' : 'Saved historical resident snapshot'}</p>
											</div>
											<div className="flex items-center gap-1">
												<OrderButtons label={participant.residentNameSnapshot || `resident ${index + 1}`} index={index} count={props.form.participants.length} onMove={moveResident} />
												<button type="button" onClick={() => props.onFormChange({...props.form, participants: props.form.participants.filter((_, participantIndex) => participantIndex !== index)})} className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Remove</button>
											</div>
										</div>
										{participant.participantSource !== 'roster' && (
											<div className="mt-3">
												<label htmlFor={`fire-drill-resident-name-${participant.key}`} className="mb-1 block text-xs font-medium text-gray-700">Saved resident name</label>
												<input id={`fire-drill-resident-name-${participant.key}`} maxLength={255} required className={inputClass} value={participant.residentNameSnapshot} onChange={(event) => props.onUpdateParticipant(index, {residentNameSnapshot: event.target.value})} />
											</div>
										)}
										<div className="mt-3 grid gap-3 sm:grid-cols-2">
											<div>
												<label htmlFor={`fire-drill-minutes-${participant.key}`} className="mb-1 block text-xs font-medium text-gray-700">Minutes to gathering place</label>
												<input id={`fire-drill-minutes-${participant.key}`} type="number" min={0} step={1} className={inputClass} value={participant.durationMinutes} onChange={(event) => props.onUpdateParticipant(index, {durationMinutes: event.target.value})} />
											</div>
											<div>
												<label htmlFor={`fire-drill-seconds-${participant.key}`} className="mb-1 block text-xs font-medium text-gray-700">Seconds (0–59)</label>
												<input id={`fire-drill-seconds-${participant.key}`} type="number" min={0} max={59} step={1} className={inputClass} value={participant.durationSeconds} onChange={(event) => props.onUpdateParticipant(index, {durationSeconds: event.target.value})} />
											</div>
										</div>
										<div className="mt-3">
											<label htmlFor={`fire-drill-comment-${participant.key}`} className="mb-1 block text-xs font-medium text-gray-700">Comments {participant.durationMinutes === '' && participant.durationSeconds === '' ? '(required when no time is recorded)' : '(optional)'}</label>
											<textarea id={`fire-drill-comment-${participant.key}`} rows={2} maxLength={2000} className={inputClass} value={participant.comment} onChange={(event) => props.onUpdateParticipant(index, {comment: event.target.value})} />
										</div>
									</article>
								))}
							</div>
						)}
					</fieldset>

					<div className="flex flex-col-reverse gap-2 border-t border-gray-200 pt-4 sm:flex-row sm:justify-end">
						<button type="button" onClick={props.onClose} disabled={props.saving} className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
						<button type="submit" disabled={props.saving || props.conflict} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300">{props.saving ? 'Saving…' : props.editor.report ? 'Save correction' : 'Record fire drill'}</button>
					</div>
				</form>

				{props.editor.report && (
					<div className="mt-5 border-t border-gray-200 pt-4">
						{props.voiding ? (
							<div className="rounded-md border border-red-200 bg-red-50 p-3">
								<p className="text-sm font-semibold text-red-900">Void Sequence {props.editor.sequence} with {props.editor.report.participants.length} resident result{props.editor.report.participants.length === 1 ? '' : 's'}?</p>
								<label htmlFor="fire-drill-void-reason" className="mt-3 block text-sm font-medium text-red-900">Reason for voiding</label>
								<textarea id="fire-drill-void-reason" rows={3} maxLength={1000} className={`${inputClass} mt-1`} value={props.voidReason} onChange={(event) => props.onVoidReasonChange(event.target.value)} required />
								<p className="mt-2 text-xs text-red-800">The event, participants, and revision history will be retained. A replacement may be recorded afterward.</p>
								<div className="mt-3 flex gap-2">
									<button type="button" onClick={props.onCancelVoid} disabled={props.saving} className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm">Cancel</button>
									<button type="button" onClick={props.onVoid} disabled={props.saving || !props.voidReason.trim() || props.conflict} className="rounded-md bg-red-700 px-3 py-2 text-sm font-medium text-white disabled:bg-gray-300">{props.saving ? 'Voiding…' : 'Confirm void'}</button>
								</div>
							</div>
						) : <button type="button" onClick={props.onStartVoid} className="text-sm font-medium text-red-700 hover:underline">Void this fire drill…</button>}
					</div>
				)}
			</div>
		</div>
	);
}

function OrderButtons({label, index, count, onMove}: {label: string; index: number; count: number; onMove: (from: number, to: number) => void}) {
	return (
		<div className="flex" aria-label={`Change order for ${label}`}>
			<button type="button" onClick={() => onMove(index, index - 1)} disabled={index === 0} className="rounded-l border border-gray-300 px-2 py-1 text-xs disabled:text-gray-300" aria-label={`Move ${label} up`}>↑</button>
			<button type="button" onClick={() => onMove(index, index + 1)} disabled={index === count - 1} className="rounded-r border border-l-0 border-gray-300 px-2 py-1 text-xs disabled:text-gray-300" aria-label={`Move ${label} down`}>↓</button>
		</div>
	);
}

function LegacyHistory({rows, loading}: {rows: LegacyFireDrill[]; loading: boolean}) {
	return (
		<details className="rounded-lg border border-gray-200 bg-white shadow-sm">
			<summary className="cursor-pointer px-4 py-3 font-semibold text-gray-900">Legacy fire drill history ({loading ? '…' : rows.length})</summary>
			<div className="border-t border-gray-200 p-4">
				<p className="mb-3 text-sm text-gray-600">These original resident-by-resident rows are read-only and are not grouped into reconstructed events.</p>
				{loading ? <p className="py-4 text-sm text-gray-600" role="status">Loading all legacy pages…</p> : rows.length === 0 ? <p className="py-4 text-sm text-gray-600">No legacy fire drill rows were recorded for this house and year.</p> : (
					<div className="overflow-x-auto">
						<table className="min-w-[900px] text-left text-sm">
							<caption className="sr-only">Read-only legacy fire drill rows</caption>
							<thead className="bg-gray-50 text-xs uppercase text-gray-600"><tr><th scope="col" className="px-3 py-2">Sequence</th><th scope="col" className="px-3 py-2">Date/time</th><th scope="col" className="px-3 py-2">Resident</th><th scope="col" className="px-3 py-2">Staff</th><th scope="col" className="px-3 py-2">Comments</th></tr></thead>
							<tbody className="divide-y divide-gray-200">{rows.map((row) => <tr key={row.id}><td className="px-3 py-3">{row.sequence === 1 ? 'Semi-Annual' : row.sequence === 2 ? 'Annual' : `Sequence ${row.sequence}`}</td><td className="px-3 py-3 text-gray-900">{formatLocalFireDrillDate(row.date)} · {formatLocalFireDrillTime(row.time)}</td><td className="px-3 py-3 text-gray-900">{row.residentName}</td><td className="px-3 py-3 text-gray-700">{row.staffName || '—'}</td><td className="max-w-md whitespace-pre-wrap px-3 py-3 text-gray-600">{row.comment || '—'}</td></tr>)}</tbody>
						</table>
					</div>
				)}
			</div>
		</details>
	);
}

function StatusPanel({title, detail, tone = 'neutral'}: {title: string; detail: string; tone?: 'neutral' | 'error'}) {
	return <div className={`rounded-lg border p-8 text-center ${tone === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-gray-200 bg-white text-gray-700'}`} role={tone === 'error' ? 'alert' : 'status'}><p className="font-semibold">{title}</p><p className="mt-1 text-sm">{detail}</p></div>;
}

async function fetchFireDrillReports(locationId: string, year: number) {
	const params = new URLSearchParams({locationId, year: String(year)});
	const response = await fetch(`/api/documents/fire-drill-reports?${params}`, {cache: 'no-store'});
	const payload = await readResponse<{data: FireDrillReportRecord[]}>(response);
	return payload.data;
}

async function fetchResidents(locationId: string) {
	const params = new URLSearchParams({locationId});
	const response = await fetch(`/api/documents/life-safety-residents?${params}`, {cache: 'no-store'});
	const payload = await readResponse<{data: ResidentOption[]}>(response);
	return payload.data;
}

async function fetchAllLegacyDrills(location: string, year: number) {
	return collectLegacyPages<LegacyFireDrill>(async (cursor) => {
		const params = new URLSearchParams({location, year: String(year), limit: '100'});
		if (cursor) params.set('cursor', cursor);
		const response = await fetch(`/api/documents/fire-drills?${params}`, {cache: 'no-store'});
		return readResponse<{data: LegacyFireDrill[]; nextCursor: string | null}>(response);
	});
}

async function readResponse<T = unknown>(response: Response): Promise<T> {
	let payload: unknown = null;
	try {
		payload = await response.json();
	} catch {
		// Preserve the status-based error below when an upstream response is not JSON.
	}
	if (!response.ok) {
		const message = payload && typeof payload === 'object' && 'error' in payload && typeof payload.error === 'string'
			? payload.error
			: `Request failed (${response.status})`;
		throw new Error(message);
	}
	return payload as T;
}

function errorMessage(error: unknown, fallback: string) {
	return error instanceof Error && error.message ? error.message : fallback;
}

function newDraftKey() {
	return typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `resident-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
