'use client';

// src/components/inspector/InspectorDashboard.tsx
//
// Read-only compliance dashboard for state inspectors. Gated by the inspector
// session cookie (established via a one-time password). No Clerk account.

import React, {useCallback, useEffect, useState} from 'react';
import {toast} from 'sonner';
import SharedIncidentsAccordion from '@/components/care/SharedIncidentsAccordion';

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
	{key: 'smoke', label: 'Smoke Detectors', icon: '🚨'},
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

	useEffect(() => {
		if (session) loadData();
	}, [session, loadData]);

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
				{loadingData || !data ? (
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

						{tab === 'fireDrills' && (
							<Section title={`Fire Drills (${data.fireDrills.length})`}>
								<SimpleTable
									columns={['Date', 'Time', 'Staff', 'Resident', 'Comment']}
									rows={data.fireDrills.map((d) => [
										new Date(d.date).toLocaleDateString(),
										d.time || '—',
										d.staffName || '—',
										d.residentName || '—',
										d.comment || '—',
									])}
								/>
							</Section>
						)}

						{tab === 'smoke' && (
							<Section
								title={`Smoke Detector Checks (${data.smokeDetectorChecks.length})`}>
								<SimpleTable
									columns={['Date', 'Smoke', 'CO', 'Staff', 'Notes']}
									rows={data.smokeDetectorChecks.map((c) => [
										new Date(c.date).toLocaleDateString(),
										c.smokeStatus || '—',
										c.coStatus || '—',
										c.staffInitials || '—',
										c.notes || '—',
									])}
								/>
							</Section>
						)}
					</>
				)}
			</main>
		</div>
	);
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
