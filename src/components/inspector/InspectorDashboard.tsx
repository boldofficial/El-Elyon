'use client';

// src/components/inspector/InspectorDashboard.tsx
//
// Read-only compliance dashboard for state inspectors. Gated by the inspector
// session cookie (established via a one-time password). No Clerk account.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import SharedIncidentsAccordion from '@/components/care/SharedIncidentsAccordion';
import type {
	InspectorFireDrillReport,
	InspectorLifeSafetyData,
	InspectorLifeSafetyInspection,
} from '@/lib/inspector-life-safety-projection';
import {
	INSPECTOR_EQUIPMENT,
	buildInspectorAnnualInspectionRows,
	filterInspectorLifeSafetyYear,
	formatInspectorDuration,
	formatInspectorLocalDate,
	formatInspectorLocalTime,
	inspectorFireDrillForSequence,
	inspectorYears,
} from './lifeSafetyPresentation';
import {
	printAnnualInspectionReport,
	printFireDrillReport,
} from '@/components/supervisor/printLifeSafetyReports';

interface Session {
	location: string;
	label: string | null;
	expiresAt: string;
}

interface OverviewData {
	location: string;
	residents: {id: string; name: string}[];
	logs: any[];
	incidents: any[];
	isps: any[];
	fireEvacPlans: any[];
	fireDrills: any[];
	smokeDetectorChecks: any[];
}

type TabKey =
	| 'logs'
	| 'incidents'
	| 'isps'
	| 'fireEvac'
	| 'fireDrills'
	| 'smoke';

const TABS: {key: TabKey; label: string; icon: string}[] = [
	{key: 'logs', label: 'Care Logs', icon: '📝'},
	{key: 'incidents', label: 'Incidents', icon: '🚨'},
	{key: 'isps', label: 'ISPs', icon: '📄'},
	{key: 'fireEvac', label: 'Fire Evacuation', icon: '🚪'},
	{key: 'fireDrills', label: 'Fire Drills', icon: '🧯'},
	{key: 'smoke', label: 'Life-Safety Inspections', icon: '🚨'},
];

function downloadHref(fileId: string) {
	return `/api/inspector/download?fileId=${encodeURIComponent(fileId)}`;
}

export default function InspectorDashboard() {
	const [session, setSession] = useState<Session | null>(null);
	const [checking, setChecking] = useState(true);
	const [otp, setOtp] = useState('');
	const [loggingIn, setLoggingIn] = useState(false);

	const [data, setData] = useState<OverviewData | null>(null);
	const [loadingData, setLoadingData] = useState(false);
	const [lifeSafety, setLifeSafety] = useState<InspectorLifeSafetyData | null>(null);
	const [loadingLifeSafety, setLoadingLifeSafety] = useState(false);
	const [lifeSafetyError, setLifeSafetyError] = useState('');
	const [tab, setTab] = useState<TabKey>('logs');

	const checkSession = useCallback(async () => {
		try {
			const res = await fetch('/api/inspector/session');
			setSession(res.ok ? await res.json() : null);
		} catch {
			setSession(null);
		} finally {
			setChecking(false);
		}
	}, []);

	useEffect(() => {
		checkSession();
	}, [checkSession]);

	const loadData = useCallback(async () => {
		setLoadingData(true);
		try {
			const res = await fetch('/api/inspector/overview');
			if (!res.ok) throw new Error('Failed to load');
			setData(await res.json());
		} catch (error) {
			console.error(error);
			toast.error('Failed to load records');
		} finally {
			setLoadingData(false);
		}
	}, []);

	const loadLifeSafety = useCallback(async () => {
		setLoadingLifeSafety(true);
		setLifeSafetyError('');
		try {
			const response = await fetch('/api/inspector/life-safety', {cache: 'no-store'});
			if (!response.ok) throw new Error('Failed to load life-safety records');
			setLifeSafety(await response.json());
		} catch (error) {
			console.error(error);
			setLifeSafety(null);
			setLifeSafetyError('Life-safety records could not be loaded for this inspector session.');
		} finally {
			setLoadingLifeSafety(false);
		}
	}, []);

	useEffect(() => {
		if (session) {
			void loadData();
			void loadLifeSafety();
		}
	}, [session, loadData, loadLifeSafety]);

	const handleLogin = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!otp.trim()) return;
		setLoggingIn(true);
		try {
			const res = await fetch('/api/inspector/login', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({otp: otp.trim()}),
			});
			const body = await res.json();
			if (!res.ok) throw new Error(body.error || 'Invalid code');
			setSession(body);
			setOtp('');
		} catch (error: any) {
			toast.error(error.message || 'Invalid or expired access code');
		} finally {
			setLoggingIn(false);
		}
	};

	const handleLogout = async () => {
		await fetch('/api/inspector/logout', {method: 'POST'});
		setSession(null);
		setData(null);
		setLifeSafety(null);
		setLifeSafetyError('');
	};

	const residentName = (id: string) =>
		data?.residents.find((r) => r.id === id)?.name || 'Unknown';

	if (checking) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
			</div>
		);
	}

	// --- Login screen ---
	if (!session) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gray-50 px-4">
				<div className="bg-white rounded-xl shadow-sm border p-8 w-full max-w-md">
					<div className="text-center mb-6">
						<div className="text-4xl mb-2">🛂</div>
						<h1 className="text-xl font-bold text-gray-900">
							State Inspector Access
						</h1>
						<p className="text-sm text-gray-600 mt-1">
							Enter the access code provided by the facility administrator.
						</p>
					</div>
					<form onSubmit={handleLogin} className="space-y-4">
						<input
							value={otp}
							onChange={(e) => setOtp(e.target.value)}
							placeholder="XXXXX-XXXXX"
							autoFocus
							className="w-full border rounded-lg px-4 py-3 text-center text-lg font-mono tracking-widest uppercase"
						/>
						<button
							type="submit"
							disabled={loggingIn}
							className="w-full bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
							{loggingIn ? 'Verifying...' : 'Access Dashboard'}
						</button>
					</form>
				</div>
			</div>
		);
	}

	// --- Dashboard ---
	return (
		<div className="min-h-screen bg-gray-50">
			<header className="bg-white border-b sticky top-0 z-10">
				<div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
					<div>
						<h1 className="text-lg font-bold text-gray-900">
							{session.location} · Compliance Records
						</h1>
						<p className="text-xs text-gray-500">
							Read-only inspector access · expires{' '}
							{new Date(session.expiresAt).toLocaleString()}
						</p>
					</div>
					<button
						onClick={handleLogout}
						className="text-sm font-medium text-gray-600 hover:text-gray-900 border rounded px-3 py-1.5">
						Exit
					</button>
				</div>
				<div className="max-w-6xl mx-auto px-4 flex gap-1 overflow-x-auto">
					{TABS.map((t) => (
						<button
							key={t.key}
							onClick={() => setTab(t.key)}
							className={`px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 ${
								tab === t.key
									? 'border-blue-600 text-blue-700'
									: 'border-transparent text-gray-500 hover:text-gray-800'
							}`}>
							<span className="mr-1">{t.icon}</span>
							{t.label}
						</button>
					))}
				</div>
			</header>

			<main className="max-w-6xl mx-auto px-4 py-6">
				{tab === 'fireDrills' || tab === 'smoke' ? (
					<InspectorLifeSafetyPanel
						kind={tab === 'fireDrills' ? 'fire-drills' : 'inspections'}
						data={lifeSafety}
						loading={loadingLifeSafety}
						error={lifeSafetyError}
						onRetry={loadLifeSafety}
					/>
				) : loadingData || !data ? (
					<div className="text-center py-12 text-gray-500">Loading records…</div>
				) : (
					<>
						{tab === 'logs' && (
							<Section title={`Care Logs (${data.logs.length})`}>
								<SimpleTable
									columns={['Date', 'Resident', 'Type', 'Author', 'Notes']}
									rows={data.logs.map((l) => [
										new Date(l.timestamp || l.createdAt).toLocaleString(),
										residentName(l.residentId),
										l.logType || '—',
										l.authorName || l.createdBy || '—',
										l.content || '—',
									])}
								/>
							</Section>
						)}

						{tab === 'incidents' && (
							<Section title={`Incident Reports (${data.incidents.length})`}>
								<SharedIncidentsAccordion
									incidents={data.incidents}
									buildAttachmentUrl={downloadHref}
								/>
							</Section>
						)}

						{tab === 'isps' && (
							<Section title={`Active ISPs (${data.isps.length})`}>
								<DocList
									items={data.isps.map((i) => ({
										id: i.id,
										title: i.residentName,
										subtitle: `${i.versionLabel} · effective ${new Date(
											i.effectiveDate
										).toLocaleDateString()}`,
										fileStorageId: i.fileStorageId,
										fileName: i.fileName,
									}))}
								/>
							</Section>
						)}

						{tab === 'fireEvac' && (
							<Section title={`Fire Evacuation Plans (${data.fireEvacPlans.length})`}>
								<DocList
									items={data.fireEvacPlans.map((p) => ({
										id: p.id,
										title: p.residentName,
										subtitle: `Version ${p.version ?? '—'} · ${
											p.createdAt
												? new Date(p.createdAt).toLocaleDateString()
												: ''
										}`,
										fileStorageId: p.fileStorageId,
										fileName: p.fileName,
									}))}
								/>
							</Section>
						)}
					</>
				)}
			</main>
		</div>
	);
}

function InspectorLifeSafetyPanel({
	kind,
	data,
	loading,
	error,
	onRetry,
}: {
	kind: 'inspections' | 'fire-drills';
	data: InspectorLifeSafetyData | null;
	loading: boolean;
	error: string;
	onRetry: () => Promise<void>;
}) {
	const currentYear = new Date().getFullYear();
	const [year, setYear] = useState(currentYear);
	const [printing, setPrinting] = useState(false);
	const years = useMemo(() => data ? inspectorYears(data, currentYear) : [currentYear], [data, currentYear]);
	const selected = useMemo(() => data ? filterInspectorLifeSafetyYear(data, year) : null, [data, year]);
	const annualRows = useMemo(
		() => buildInspectorAnnualInspectionRows(data?.inspections ?? [], year),
		[data, year]
	);

	async function printSelectedReport() {
		if (!data || !selected || printing) return;
		setPrinting(true);
		try {
			if (kind === 'inspections') {
				await printAnnualInspectionReport({
					houseName: data.houseName,
					year,
					entries: selected.inspections.map((entry) => ({
						reportMonth: entry.reportMonth,
						equipmentType: entry.equipmentType,
						inspectionDate: entry.inspectionDate,
						staffInitials: entry.staffInitials,
					})),
				});
			} else {
				await printFireDrillReport({
					houseName: data.houseName,
					year,
					reports: selected.fireDrills,
				});
			}
		} catch (printError) {
			console.error(printError);
			toast.error('Could not open the life-safety print report');
		} finally {
			setPrinting(false);
		}
	}

	if (loading) {
		return <InspectorStatus title="Loading life-safety records…" detail="Reading this inspector session’s authorized house only." />;
	}
	if (error) {
		return (
			<div className="rounded-lg border border-red-200 bg-red-50 p-6 text-red-900" role="alert">
				<p className="font-semibold">Life-safety records are unavailable.</p>
				<p className="mt-1 text-sm">{error}</p>
				<button type="button" onClick={() => void onRetry()} className="mt-3 text-sm font-medium underline">Try again</button>
			</div>
		);
	}
	if (!data || !selected) {
		return <InspectorStatus title="No life-safety data" detail="No records were returned for this inspector session." />;
	}

	return (
		<div className="space-y-5">
			<section className="rounded-lg border border-gray-200 bg-white p-4" aria-labelledby="inspector-life-safety-filter-heading">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
					<div>
						<h2 id="inspector-life-safety-filter-heading" className="font-semibold text-gray-900">
							{kind === 'inspections' ? 'Annual life-safety inspections' : 'Fire drill reports'}
						</h2>
						<p className="mt-1 text-sm text-gray-600">{data.houseName} · read-only inspector view</p>
						<label htmlFor={`inspector-${kind}-year`} className="mt-3 block text-xs font-medium uppercase tracking-wide text-gray-600">Reporting year</label>
						<select id={`inspector-${kind}-year`} value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 min-w-40 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">
							{years.map((availableYear) => <option key={availableYear} value={availableYear}>{availableYear}</option>)}
						</select>
					</div>
					<button type="button" onClick={() => void printSelectedReport()} disabled={printing} className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-300">
						{printing ? 'Preparing report…' : kind === 'inspections' ? 'Print annual sheet' : 'Print fire drill sheet'}
					</button>
				</div>
			</section>

			{kind === 'inspections' ? (
				<InspectorInspectionView rows={annualRows} legacyRows={selected.legacySmokeChecks} />
			) : (
				<InspectorFireDrillView reports={selected.fireDrills} legacyRows={selected.legacyFireDrills} />
			)}
		</div>
	);
}

function InspectorInspectionView({
	rows,
	legacyRows,
}: {
	rows: ReturnType<typeof buildInspectorAnnualInspectionRows>;
	legacyRows: InspectorLifeSafetyData['legacySmokeChecks'];
}) {
	return (
		<>
			<section className="overflow-hidden rounded-lg border border-gray-200 bg-white" aria-labelledby="inspector-normalized-inspections-heading">
				<div className="border-b border-gray-200 px-4 py-3">
					<h3 id="inspector-normalized-inspections-heading" className="font-semibold text-gray-900">Annual inspection record</h3>
					<p className="mt-1 text-sm text-gray-600">Blank cells mean no normalized inspection was recorded; they are not failures.</p>
				</div>
				<div className="hidden overflow-x-auto md:block">
					<table className="min-w-[980px] table-fixed text-left text-sm">
						<caption className="sr-only">January through December normalized life-safety inspections</caption>
						<thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600"><tr><th scope="col" className="w-28 border-b border-r border-gray-200 px-4 py-3">Month</th>{INSPECTOR_EQUIPMENT.map((equipment) => <th key={equipment.type} scope="col" className="border-b border-r border-gray-200 px-3 py-3 last:border-r-0">{equipment.label}</th>)}</tr></thead>
						<tbody>{rows.map((row) => <tr key={row.month} className="align-top even:bg-gray-50/40"><th scope="row" className="border-b border-r border-gray-200 px-4 py-4 font-semibold text-gray-900">{row.monthName}</th>{INSPECTOR_EQUIPMENT.map((equipment) => <td key={equipment.type} className="border-b border-r border-gray-200 p-3 last:border-r-0"><InspectorInspectionCell entry={row.entries[equipment.type]} /></td>)}</tr>)}</tbody>
					</table>
				</div>
				<div className="divide-y divide-gray-200 md:hidden">
					{rows.map((row) => <section key={row.month} className="p-4" aria-labelledby={`inspector-month-${row.month}`}><h4 id={`inspector-month-${row.month}`} className="font-semibold text-gray-900">{row.monthName}</h4><div className="mt-3 space-y-3">{INSPECTOR_EQUIPMENT.map((equipment) => <div key={equipment.type}><p className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-500">{equipment.label}</p><InspectorInspectionCell entry={row.entries[equipment.type]} /></div>)}</div></section>)}
				</div>
			</section>

			<details className="rounded-lg border border-gray-200 bg-white">
				<summary className="cursor-pointer px-4 py-3 font-semibold text-gray-900">Original legacy smoke and CO rows ({legacyRows.length})</summary>
				<div className="border-t border-gray-200 p-4">
					<p className="mb-3 text-sm text-gray-600">Legacy rows remain read-only, separate, and ungrouped.</p>
					<SimpleTable columns={['Date', 'Smoke', 'CO', 'Initials', 'Notes']} rows={legacyRows.map((row) => [formatInspectorLocalDate(row.date), row.smokeStatus || '—', row.coStatus || '—', row.staffInitials || '—', row.notes || '—'])} />
				</div>
			</details>
		</>
	);
}

function InspectorInspectionCell({entry}: {entry?: InspectorLifeSafetyInspection}) {
	if (!entry) return <div className="rounded-md border border-dashed border-gray-300 bg-gray-50 p-3 text-sm text-gray-500">Not recorded</div>;
	return (
		<div className="rounded-md border border-gray-200 bg-white p-3">
			<div className="flex items-center justify-between gap-2">
				<span className="font-medium text-gray-900">{formatInspectorLocalDate(entry.inspectionDate)}</span>
				<span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${entry.outcome === 'fail' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>{entry.outcome === 'fail' ? 'Failed' : 'Passed'}</span>
			</div>
			<p className="mt-1 text-xs text-gray-600">Initials: {entry.staffInitials}</p>
			{entry.notes && <p className="mt-2 whitespace-pre-wrap text-xs text-gray-600">{entry.notes}</p>}
		</div>
	);
}

function InspectorFireDrillView({
	reports,
	legacyRows,
}: {
	reports: InspectorFireDrillReport[];
	legacyRows: InspectorLifeSafetyData['legacyFireDrills'];
}) {
	return (
		<>
			<section className="rounded-lg border border-gray-200 bg-white" aria-labelledby="inspector-normalized-drills-heading">
				<div className="border-b border-gray-200 px-4 py-3">
					<h3 id="inspector-normalized-drills-heading" className="font-semibold text-gray-900">Normalized fire drill events</h3>
					<p className="mt-1 text-sm text-gray-600">Each slot is one complete event with its ordered resident results.</p>
				</div>
				<div className="grid gap-4 p-4 lg:grid-cols-2">
					<InspectorFireDrillCard label="Semi-Annual Fire Drill" sequence={1} report={inspectorFireDrillForSequence(reports, 1)} />
					<InspectorFireDrillCard label="Annual Fire Drill" sequence={2} report={inspectorFireDrillForSequence(reports, 2)} />
				</div>
			</section>

			<details className="rounded-lg border border-gray-200 bg-white">
				<summary className="cursor-pointer px-4 py-3 font-semibold text-gray-900">Original legacy fire drill rows ({legacyRows.length})</summary>
				<div className="border-t border-gray-200 p-4">
					<p className="mb-3 text-sm text-gray-600">These original resident-by-resident rows remain read-only and are not reconstructed into events.</p>
					<SimpleTable columns={['Sequence', 'Date/time', 'Resident', 'Staff', 'Comment']} rows={legacyRows.map((row) => [row.sequence === 1 ? 'Semi-Annual' : row.sequence === 2 ? 'Annual' : `Sequence ${row.sequence}`, `${formatInspectorLocalDate(row.date)} · ${formatInspectorLocalTime(row.time)}`, row.residentName, row.staffName || '—', row.comment || '—'])} />
				</div>
			</details>
		</>
	);
}

function InspectorFireDrillCard({label, sequence, report}: {label: string; sequence: 1 | 2; report?: InspectorFireDrillReport}) {
	return (
		<article className={`rounded-lg border p-4 ${report ? 'border-gray-200' : 'border-dashed border-gray-300 bg-gray-50'}`} aria-labelledby={`inspector-fire-drill-${sequence}`}>
			<p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Sequence {sequence}</p>
			<h4 id={`inspector-fire-drill-${sequence}`} className="mt-1 font-semibold text-gray-900">{label}</h4>
			{!report ? <p className="mt-4 text-sm text-gray-600">No normalized event was recorded for this slot.</p> : (
				<div className="mt-4 space-y-3 text-sm">
					<p><span className="font-medium text-gray-700">Date/time:</span> {formatInspectorLocalDate(report.drillDate)} · {formatInspectorLocalTime(report.drillTime)}</p>
					<p><span className="font-medium text-gray-700">Staff present:</span> {report.staffNames.join(', ')}</p>
					<div>
						<p className="font-medium text-gray-700">Resident results ({report.participants.length})</p>
						{report.participants.length === 0 ? <p className="mt-1 text-gray-500">No resident results.</p> : <ul className="mt-2 divide-y divide-gray-200 rounded-md border border-gray-200">{report.participants.map((participant) => <li key={`${participant.position}-${participant.residentNameSnapshot}`} className="px-3 py-2"><div className="flex flex-col gap-1 sm:flex-row sm:justify-between"><span className="font-medium text-gray-900">{participant.residentNameSnapshot}</span><span className="text-gray-600">{formatInspectorDuration(participant.durationMinutes, participant.durationSeconds)}</span></div>{participant.comment && <p className="mt-1 whitespace-pre-wrap text-xs text-gray-600">{participant.comment}</p>}</li>)}</ul>}
					</div>
				</div>
			)}
		</article>
	);
}

function InspectorStatus({title, detail}: {title: string; detail: string}) {
	return <div className="rounded-lg border border-gray-200 bg-white p-10 text-center text-gray-700" role="status"><p className="font-semibold">{title}</p><p className="mt-1 text-sm">{detail}</p></div>;
}

function Section({title, children}: {title: string; children: React.ReactNode}) {
	return (
		<div className="space-y-3">
			<h2 className="text-base font-semibold text-gray-900">{title}</h2>
			{children}
		</div>
	);
}

function SimpleTable({
	columns,
	rows,
}: {
	columns: string[];
	rows: (string | number)[][];
}) {
	if (rows.length === 0) {
		return (
			<div className="bg-white border rounded-lg p-8 text-center text-gray-500">
				No records.
			</div>
		);
	}
	return (
		<div className="bg-white border rounded-lg overflow-x-auto">
			<table className="w-full text-sm">
				<thead>
					<tr className="text-left text-gray-500 border-b">
						{columns.map((c) => (
							<th key={c} className="px-4 py-2 font-medium whitespace-nowrap">
								{c}
							</th>
						))}
					</tr>
				</thead>
				<tbody className="divide-y">
					{rows.map((row, i) => (
						<tr key={i} className="align-top">
							{row.map((cell, j) => (
								<td key={j} className="px-4 py-2 text-gray-800">
									{cell}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function DocList({
	items,
}: {
	items: {
		id: string;
		title: string;
		subtitle: string;
		fileStorageId?: string | null;
		fileName?: string | null;
	}[];
}) {
	if (items.length === 0) {
		return (
			<div className="bg-white border rounded-lg p-8 text-center text-gray-500">
				No documents on file.
			</div>
		);
	}
	return (
		<div className="bg-white border rounded-lg divide-y">
			{items.map((item) => (
				<div
					key={item.id}
					className="px-4 py-3 flex items-center justify-between gap-4">
					<div className="min-w-0">
						<p className="text-sm font-medium text-gray-900">{item.title}</p>
						<p className="text-xs text-gray-500">{item.subtitle}</p>
					</div>
					{item.fileStorageId ? (
						<a
							href={downloadHref(item.fileStorageId)}
							target="_blank"
							rel="noopener noreferrer"
							className="flex-shrink-0 text-sm font-medium text-blue-600 hover:text-blue-800">
							Download
						</a>
					) : (
						<span className="text-xs text-gray-400">No file</span>
					)}
				</div>
			))}
		</div>
	);
}
