'use client';

import React, {useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import {
	ADMISSION_STATE_LABELS,
	DRILL_TYPE_OPTIONS,
	FIRE_DRILL_SLOTS,
	admissionReports,
	buildAdmissionDrillRows,
	drillTypeOption,
	formatGatheringDuration,
	formatLocalFireDrillDate,
	formatLocalFireDrillTime,
	isOpenAdmissionState,
	moveParticipant,
	participantDraftsFromReport,
	preserveUnavailableRosterSnapshots,
	reportForSequence,
	validateParticipantDrafts,
	validateStaffNames,
	type AdmissionDrillFact,
	type AdmissionDrillRow,
	type DrillTypeKey,
	type FireDrillReportRecord,
	type ParticipantDraft,
	type ParticipantSource,
} from './fireDrillModel';
import {
	collectLegacyPages,
	lifeSafetyErrorMessage,
	readLifeSafetyResponse,
} from './lifeSafetyWorkspace';
import {printAdmissionDrillReport, printFireDrillReport} from './printLifeSafetyReports';
import {ADMISSION_DRILL_DEADLINE_DAYS, toLocalDate} from '@/lib/life-safety-reporting';

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
	typeKey: DrillTypeKey;
	report?: FireDrillReportRecord;
};

type EditorForm = {
	admissionResidentId: string;
	drillDate: string;
	drillTime: string;
	staffNames: string[];
	participants: ParticipantDraft[];
};

const inputClass =
	'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200 disabled:bg-gray-100';

const PARTICIPANT_SOURCE_LABELS: Record<ParticipantSource, string> = {
	roster: 'Roster resident',
	manual: 'Resident not on roster',
};

export default function FireDrillWorkspace() {
	const currentYear = new Date().getFullYear();
	const [locations, setLocations] = useState<LocationOption[]>([]);
	const [selectedLocationId, setSelectedLocationId] = useState('');
	const [year, setYear] = useState(currentYear);
	const [reports, setReports] = useState<FireDrillReportRecord[]>([]);
	const [residents, setResidents] = useState<ResidentOption[]>([]);
	const [legacyRows, setLegacyRows] = useState<LegacyFireDrill[]>([]);
	const [admissionFacts, setAdmissionFacts] = useState<AdmissionDrillFact[]>([]);
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
	const today = toLocalDate(new Date());
	const admissionRows = useMemo(() => buildAdmissionDrillRows(admissionFacts, today), [admissionFacts, today]);

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
			setReports([]);
			setResidents([]);
			setLegacyRows([]);
			setAdmissionFacts([]);
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
			setAdmissionFacts([]);
			try {
				const [currentReports, authorizedResidents, legacy, facts] = await Promise.all([
					fetchFireDrillReports(location.id, year),
					fetchResidents(location.id),
					fetchAllLegacyDrills(location.name, year),
					fetchAdmissionFacts(location.id),
				]);
				if (cancelled) return;
				setReports(currentReports);
				setResidents(authorizedResidents);
				setLegacyRows(legacy);
				setAdmissionFacts(facts);
				setRecordsState('ready');
			} catch (error) {
				if (cancelled) return;
				setRecordsError(lifeSafetyErrorMessage(error, 'Could not load fire drill records'));
				setRecordsState('error');
			}
		}
		void loadRecords();
		return () => {
			cancelled = true;
		};
	}, [selectedLocation, validYear, year, reloadToken]);

	function openEditor(typeKey: DrillTypeKey, report?: FireDrillReportRecord, admissionResidentId = '') {
		setEditor({typeKey, report});
		const participants = report
			? preserveUnavailableRosterSnapshots(participantDraftsFromReport(report), residentIds)
			: [];
		setEditorForm({
			admissionResidentId: report?.admissionResidentId ?? admissionResidentId,
			drillDate: report?.drillDate ?? '',
			drillTime: report?.drillTime?.slice(0, 5) ?? '',
			staffNames: report ? [...report.staffNames] : [''],
			participants:
				!report && admissionResidentId
					? withAdmissionResident(participants, admissionResidentId)
					: participants,
		});
		setResidentToAdd('');
		setFormErrors([]);
		setConflict(false);
		setVoiding(false);
		setVoidReason('');
	}

	// Opens the single "record a drill" form, defaulting to the first
	// scheduled slot still empty this year, else an admission drill.
	function openNewDrill() {
		const slot = FIRE_DRILL_SLOTS.find((candidate) => !reportForSequence(reports, candidate.sequence));
		openEditor(slot ? (slot.sequence === 1 ? 'semi_annual' : 'annual') : 'admission');
	}

	// Switching type inside the form. A scheduled slot already recorded this
	// year cannot be duplicated (DB constraint), so choosing it opens that
	// report for correction instead.
	function changeDrillType(typeKey: DrillTypeKey) {
		if (!editorForm || editor?.report) return;
		const option = drillTypeOption(typeKey);
		const existing = option.sequence ? reportForSequence(reports, option.sequence) : undefined;
		if (existing) {
			openEditor(typeKey, existing);
			return;
		}
		setEditor({typeKey});
		setEditorForm({
			...editorForm,
			admissionResidentId: typeKey === 'admission' ? editorForm.admissionResidentId : '',
		});
		setFormErrors([]);
	}

	function changeAdmissionResident(residentId: string) {
		if (!editorForm) return;
		setEditorForm({
			...editorForm,
			admissionResidentId: residentId,
			participants: residentId
				? withAdmissionResident(editorForm.participants, residentId)
				: editorForm.participants,
		});
	}

	// The admitted resident is the reason the drill exists, so their result
	// column is always present on the sheet.
	function withAdmissionResident(participants: ParticipantDraft[], residentId: string): ParticipantDraft[] {
		if (participants.some((participant) => participant.residentId === residentId)) return participants;
		const resident = residents.find((candidate) => candidate.id === residentId);
		if (!resident) return participants;
		return [
			{
				key: newDraftKey(),
				residentId: resident.id,
				residentNameSnapshot: resident.name,
				participantSource: 'roster',
				durationMinutes: '',
				durationSeconds: '',
				comment: '',
			},
			...participants,
		];
	}

	function closeEditor() {
		if (saving) return;
		closeEditorAfterSave();
	}

	function appendParticipant(participant: ParticipantDraft) {
		if (!editorForm) return;
		setEditorForm({
			...editorForm,
			participants: [...editorForm.participants, participant],
		});
	}

	function addResident() {
		if (!editorForm || !residentToAdd) return;
		const resident = residents.find((candidate) => candidate.id === residentToAdd);
		if (!resident || editorForm.participants.some((participant) => participant.residentId === resident.id)) return;
		appendParticipant({
			key: newDraftKey(),
			residentId: resident.id,
			residentNameSnapshot: resident.name,
			participantSource: 'roster',
			durationMinutes: '',
			durationSeconds: '',
			comment: '',
		});
		setResidentToAdd('');
	}

	function addNamedParticipant(participantSource: Exclude<ParticipantSource, 'roster'>) {
		appendParticipant({
			key: newDraftKey(),
			residentId: null,
			residentNameSnapshot: '',
			participantSource,
			durationMinutes: '',
			durationSeconds: '',
			comment: '',
		});
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

	function updateParticipantSource(index: number, participantSource: ParticipantSource) {
		if (!editorForm) return;
		const current = editorForm.participants[index];
		if (!current) return;
		if (participantSource === 'roster') {
			const resident = current.residentId
				? residents.find((candidate) => candidate.id === current.residentId)
				: null;
			updateParticipant(index, {
				participantSource,
				residentId: resident?.id ?? null,
				residentNameSnapshot: resident?.name ?? '',
			});
			return;
		}

		updateParticipant(index, {
			participantSource,
			residentId: null,
		});
	}

	function updateParticipantResident(index: number, residentId: string) {
		if (!editorForm) return;
		const resident = residents.find((candidate) => candidate.id === residentId);
		updateParticipant(index, {
			participantSource: 'roster',
			residentId: resident?.id ?? null,
			residentNameSnapshot: resident?.name ?? '',
		});
	}

	async function saveReport(event: React.FormEvent) {
		event.preventDefault();
		if (!editor || !editorForm || !selectedLocation) return;
		const participantResult = validateParticipantDrafts(editorForm.participants);
		const staffResult = validateStaffNames(editorForm.staffNames);
		const errors = [...staffResult.errors, ...participantResult.errors];
		const option = drillTypeOption(editor.typeKey);
		if (option.drillType === 'admission') {
			if (!editorForm.admissionResidentId) {
				errors.unshift('Choose the newly placed resident this admission drill is for.');
			} else if (
				!participantResult.participants.some(
					(participant) => participant.residentId === editorForm.admissionResidentId
				)
			) {
				errors.unshift('The newly placed resident must be included in the resident results.');
			}
		}
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
			drillType: option.drillType,
			sequence: option.sequence,
			admissionResidentId: option.drillType === 'admission' ? editorForm.admissionResidentId : null,
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
			await readLifeSafetyResponse(response);
			toast.success(isCorrection ? 'Fire drill corrected' : 'Fire drill recorded');
			closeEditorAfterSave();
			setReloadToken((value) => value + 1);
		} catch (error) {
			setFormErrors([lifeSafetyErrorMessage(error, 'Could not save the fire drill')]);
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
			await readLifeSafetyResponse(response);
			toast.success('Fire drill voided; its event facts and revision history were retained');
			closeEditorAfterSave();
			setReloadToken((value) => value + 1);
		} catch (error) {
			setFormErrors([lifeSafetyErrorMessage(error, 'Could not void the fire drill')]);
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
				reports: reports.filter((report) => report.drillType === 'scheduled' && report.sequence !== null).map((report) => ({
					sequence: report.sequence as 1 | 2,
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
			toast.error(lifeSafetyErrorMessage(error, 'Could not open the fire drill report'));
		} finally {
			setPrinting(false);
		}
	}

	async function printAdmissionSheet(report: FireDrillReportRecord) {
		if (!selectedLocation || printing) return;
		setPrinting(true);
		try {
			await printAdmissionDrillReport({
				houseName: selectedLocation.name,
				year: report.reportYear,
				residentName: report.admissionResidentNameSnapshot ?? '',
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
			});
		} catch (error) {
			toast.error(lifeSafetyErrorMessage(error, 'Could not open the admission drill sheet'));
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
				<div className="flex flex-col gap-3 border-b border-gray-200 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<h3 id="fire-drill-events-heading" className="font-semibold text-gray-900">Fire drill events</h3>
						<p className="mt-1 text-sm text-gray-600">Record the actual event facts once, including everyone present and each resident result.</p>
					</div>
					<button type="button" onClick={openNewDrill} disabled={recordsState !== 'ready'} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-300">
						+ Record a drill
					</button>
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
							return <FireDrillSlot key={slot.sequence} sequence={slot.sequence} label={slot.label} report={report} onOpen={() => openEditor(slot.sequence === 1 ? 'semi_annual' : 'annual', report)} />;
						})}
					</div>
				)}
			</section>

			{recordsState === 'ready' && (
				<AdmissionDrillPanel
					rows={admissionRows}
					reports={admissionReports(reports)}
					year={year}
					printing={printing}
					onRecord={(residentId) => openEditor('admission', undefined, residentId)}
					onCorrect={(report) => openEditor('admission', report)}
					onPrint={(report) => void printAdmissionSheet(report)}
				/>
			)}

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
					onChangeDrillType={changeDrillType}
					onChangeAdmissionResident={changeAdmissionResident}
					onResidentToAddChange={setResidentToAdd}
					onAddResident={addResident}
					onAddManualParticipant={() => addNamedParticipant('manual')}
					onUpdateParticipant={updateParticipant}
					onChangeParticipantSource={updateParticipantSource}
					onChangeParticipantResident={updateParticipantResident}
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
	onChangeDrillType: (typeKey: DrillTypeKey) => void;
	onChangeAdmissionResident: (residentId: string) => void;
	onResidentToAddChange: (id: string) => void;
	onAddResident: () => void;
	onAddManualParticipant: () => void;
	onUpdateParticipant: (index: number, changes: Partial<ParticipantDraft>) => void;
	onChangeParticipantSource: (index: number, participantSource: ParticipantSource) => void;
	onChangeParticipantResident: (index: number, residentId: string) => void;
	onSave: (event: React.FormEvent) => void;
	onClose: () => void;
	onReload: () => void;
	onStartVoid: () => void;
	onCancelVoid: () => void;
	onVoidReasonChange: (reason: string) => void;
	onVoid: () => void;
}) {
	const option = drillTypeOption(props.editor.typeKey);
	const isAdmission = option.drillType === 'admission';
	const selectedRosterIds = new Set(
		props.form.participants
			.filter((participant) => participant.participantSource === 'roster' && participant.residentId)
			.map((participant) => participant.residentId as string)
	);
	const availableResidents = props.residents.filter((resident) => !selectedRosterIds.has(resident.id));
	const residentOptionsFor = (participant: ParticipantDraft) =>
		props.residents.filter(
			(resident) => resident.id === participant.residentId || !selectedRosterIds.has(resident.id)
		);
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
						<h3 id="fire-drill-editor-title" className="text-lg font-semibold text-gray-900">{props.editor.report ? 'Correct' : 'Record'} {option.label.toLowerCase()}</h3>
						<p className="mt-1 text-sm text-gray-600">{props.houseName} · {props.year}{option.sequence ? ` · Sequence ${option.sequence}` : ''}</p>
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
						<legend className="col-span-full text-sm font-semibold text-gray-900">Type of drill</legend>
						<div>
							<label htmlFor="fire-drill-type" className="mb-1 block text-sm font-medium text-gray-700">Drill type</label>
							<select id="fire-drill-type" className={inputClass} value={props.editor.typeKey} disabled={Boolean(props.editor.report)} onChange={(event) => props.onChangeDrillType(event.target.value as DrillTypeKey)}>
								{DRILL_TYPE_OPTIONS.map((candidate) => <option key={candidate.key} value={candidate.key}>{candidate.label}</option>)}
							</select>
							{props.editor.report && <p className="mt-1 text-xs text-gray-500">The type cannot change on a correction. Void this drill and record a new one instead.</p>}
						</div>
						{isAdmission && (
							<div>
								<label htmlFor="fire-drill-admission-resident" className="mb-1 block text-sm font-medium text-gray-700">Newly placed resident</label>
								<select id="fire-drill-admission-resident" className={inputClass} value={props.form.admissionResidentId} required disabled={Boolean(props.editor.report)} onChange={(event) => props.onChangeAdmissionResident(event.target.value)}>
									<option value="">Choose the admitted resident…</option>
									{props.residents.map((resident) => <option key={resident.id} value={resident.id}>{resident.name}</option>)}
								</select>
								<p className="mt-1 text-xs text-gray-500">Must be completed within {ADMISSION_DRILL_DEADLINE_DAYS} days after placement. Other residents who took part can be added below.</p>
							</div>
						)}
					</fieldset>

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
						<div className="mt-2 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
							<label className="sr-only" htmlFor="fire-drill-add-resident">Authorized house resident</label>
							<select id="fire-drill-add-resident" className={inputClass} value={props.residentToAdd} onChange={(event) => props.onResidentToAddChange(event.target.value)}>
								<option value="">Choose an authorized resident…</option>
								{availableResidents.map((resident) => <option key={resident.id} value={resident.id}>{resident.name}</option>)}
							</select>
							<button type="button" onClick={props.onAddResident} disabled={!props.residentToAdd} className="shrink-0 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:bg-gray-300">Add roster resident</button>
							<button type="button" onClick={props.onAddManualParticipant} className="shrink-0 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50">Add resident not on roster</button>
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
												<p className="text-xs text-gray-500">{PARTICIPANT_SOURCE_LABELS[participant.participantSource]}</p>
											</div>
											<div className="flex items-center gap-1">
												<OrderButtons label={participant.residentNameSnapshot || `resident ${index + 1}`} index={index} count={props.form.participants.length} onMove={moveResident} />
												<button type="button" onClick={() => props.onFormChange({...props.form, participants: props.form.participants.filter((_, participantIndex) => participantIndex !== index)})} className="rounded px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-50">Remove</button>
											</div>
										</div>
										<div className="mt-3 grid gap-3 lg:grid-cols-3">
											<div>
												<label htmlFor={`fire-drill-source-${participant.key}`} className="mb-1 block text-xs font-medium text-gray-700">Participant source</label>
												<select
													id={`fire-drill-source-${participant.key}`}
													className={inputClass}
													value={participant.participantSource}
													onChange={(event) => props.onChangeParticipantSource(index, event.target.value as ParticipantSource)}
												>
													<option value="roster">Roster resident</option>
													<option value="manual">Resident not on roster</option>
												</select>
											</div>
											{participant.participantSource === 'roster' ? (
												<div className="lg:col-span-2">
													<label htmlFor={`fire-drill-resident-${participant.key}`} className="mb-1 block text-xs font-medium text-gray-700">Authorized resident</label>
													<select
														id={`fire-drill-resident-${participant.key}`}
														className={inputClass}
														value={participant.residentId ?? ''}
														onChange={(event) => props.onChangeParticipantResident(index, event.target.value)}
													>
														<option value="">Choose an authorized resident…</option>
														{residentOptionsFor(participant).map((resident) => <option key={resident.id} value={resident.id}>{resident.name}</option>)}
													</select>
													<p className="mt-1 text-xs text-gray-500">Selecting a resident keeps this result linked to the roster.</p>
												</div>
											) : (
												<div className="lg:col-span-2">
													<label htmlFor={`fire-drill-resident-name-${participant.key}`} className="mb-1 block text-xs font-medium text-gray-700">
														Resident name
													</label>
													<input
														id={`fire-drill-resident-name-${participant.key}`}
														maxLength={255}
														required
														className={inputClass}
														value={participant.residentNameSnapshot}
														onChange={(event) => props.onUpdateParticipant(index, {residentNameSnapshot: event.target.value})}
														placeholder={participant.participantSource === 'manual' ? 'Name of the person in the house' : 'Name of the outside participant'}
													/>
													<p className="mt-1 text-xs text-gray-500">
														{participant.participantSource === 'manual'
															? 'Use a free-text name when the person is not on the house roster.'
															: 'Use a free-text name for a visitor, contractor, or other outside participant.'}
													</p>
												</div>
											)}
										</div>
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
								<p className="text-sm font-semibold text-red-900">Void this {option.label.toLowerCase()} with {props.editor.report.participants.length} resident result{props.editor.report.participants.length === 1 ? '' : 's'}?</p>
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

function AdmissionDrillPanel({rows, reports, year, printing, onRecord, onCorrect, onPrint}: {
	rows: AdmissionDrillRow[];
	reports: FireDrillReportRecord[];
	year: number;
	printing: boolean;
	onRecord: (residentId: string) => void;
	onCorrect: (report: FireDrillReportRecord) => void;
	onPrint: (report: FireDrillReportRecord) => void;
}) {
	const open = rows.filter((row) => isOpenAdmissionState(row.state));
	return (
		<section className="rounded-lg border border-gray-200 bg-white shadow-sm" aria-labelledby="admission-drill-heading">
			<div className="border-b border-gray-200 px-4 py-3">
				<h3 id="admission-drill-heading" className="font-semibold text-gray-900">Admission/placement drills</h3>
				<p className="mt-1 text-sm text-gray-600">Every newly placed resident needs a drill within {ADMISSION_DRILL_DEADLINE_DAYS} days of placement. The countdown starts from the placement date on the resident profile (or the day the resident was added, if none is set).</p>
			</div>
			<div className="space-y-4 p-4">
				<div>
					<h4 className="text-sm font-semibold text-gray-900">Countdown ({open.length} open)</h4>
					{rows.length === 0 ? (
						<p className="mt-2 text-sm text-gray-600">No active residents with a placement date at this house.</p>
					) : (
						<ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
							{rows.map((row) => (
								<li key={row.residentId} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="font-medium text-gray-900">{row.residentName}</p>
										<p className="text-xs text-gray-600">Placed {formatLocalFireDrillDate(row.anchorDate)} · deadline {formatLocalFireDrillDate(row.deadline)}{row.drill ? ` · drilled ${formatLocalFireDrillDate(row.drill.drillDate)}` : ''}</p>
									</div>
									<div className="flex items-center gap-2">
										<AdmissionStateBadge row={row} />
										{isOpenAdmissionState(row.state) && (
											<button type="button" onClick={() => onRecord(row.residentId)} className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700">Record drill</button>
										)}
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
				<div>
					<h4 className="text-sm font-semibold text-gray-900">Recorded in {year} ({reports.length})</h4>
					{reports.length === 0 ? (
						<p className="mt-2 text-sm text-gray-600">No admission drills are recorded for this reporting year.</p>
					) : (
						<ul className="mt-2 divide-y divide-gray-100 rounded-md border border-gray-200">
							{reports.map((report) => (
								<li key={report.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
									<div>
										<p className="font-medium text-gray-900">{report.admissionResidentNameSnapshot}</p>
										<p className="text-xs text-gray-600">{formatLocalFireDrillDate(report.drillDate)} · {formatLocalFireDrillTime(report.drillTime)} · {report.participants.length} resident result{report.participants.length === 1 ? '' : 's'} · staff: {report.staffNames.join(', ')}</p>
									</div>
									<div className="flex items-center gap-2">
										<button type="button" onClick={() => onPrint(report)} disabled={printing} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50 disabled:text-gray-400">Print sheet</button>
										<button type="button" onClick={() => onCorrect(report)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-800 hover:bg-gray-50">Correct</button>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</section>
	);
}

function AdmissionStateBadge({row}: {row: AdmissionDrillRow}) {
	const tone =
		row.state === 'overdue' ? 'bg-red-100 text-red-900'
		: row.state === 'due' ? 'bg-amber-100 text-amber-900'
		: row.state === 'completed_late' ? 'bg-orange-100 text-orange-900'
		: row.state === 'completed' ? 'bg-green-100 text-green-900'
		: 'bg-gray-100 text-gray-800';
	const detail =
		row.state === 'due' ? (row.daysRemaining === 0 ? ' · today' : ` · ${row.daysRemaining} day${row.daysRemaining === 1 ? '' : 's'} left`)
		: row.state === 'overdue' ? ` · ${-row.daysRemaining} day${row.daysRemaining === -1 ? '' : 's'} past`
		: '';
	return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{ADMISSION_STATE_LABELS[row.state]}{detail}</span>;
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
	const payload = await readLifeSafetyResponse<{data: FireDrillReportRecord[]}>(response);
	return payload.data;
}

async function fetchResidents(locationId: string) {
	const params = new URLSearchParams({locationId});
	const response = await fetch(`/api/documents/life-safety-residents?${params}`, {cache: 'no-store'});
	const payload = await readLifeSafetyResponse<{data: ResidentOption[]}>(response);
	return payload.data;
}

async function fetchAdmissionFacts(locationId: string) {
	const params = new URLSearchParams({locationId});
	const response = await fetch(`/api/documents/admission-drill-status?${params}`, {cache: 'no-store'});
	const payload = await readLifeSafetyResponse<{data: AdmissionDrillFact[]}>(response);
	return payload.data;
}

async function fetchAllLegacyDrills(location: string, year: number) {
	return collectLegacyPages<LegacyFireDrill>(async (cursor) => {
		const params = new URLSearchParams({location, year: String(year), limit: '100'});
		if (cursor) params.set('cursor', cursor);
		const response = await fetch(`/api/documents/fire-drills?${params}`, {cache: 'no-store'});
		return readLifeSafetyResponse<{data: LegacyFireDrill[]; nextCursor: string | null}>(response);
	});
}

function newDraftKey() {
	return typeof crypto !== 'undefined' && 'randomUUID' in crypto
		? crypto.randomUUID()
		: `resident-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
