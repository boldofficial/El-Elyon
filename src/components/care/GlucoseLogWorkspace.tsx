'use client';

// src/components/care/GlucoseLogWorkspace.tsx
//
// Blood sugar log for one resident: their limits and physician instructions,
// rechecks still owed, today's scheduled checks, the entry form, the last 14
// days of history (with edit, edit history and supervisor review) and a
// printable monthly log.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import type {SlotState} from '@/lib/custom-log-schedule';
import {
	ACTION_LABELS,
	AUTHOR_EDIT_WINDOW_MINUTES,
	CHECK_TYPE_LABELS,
	GLUCOSE_STATUS_LABELS,
	SYMPTOM_LABELS,
	formatGlucoseReading,
	isGlucoseUnit,
	isCritical,
	type GlucoseAction,
	type GlucoseCheckMethod,
	type GlucoseCheckType,
	type GlucoseStatus,
	type GlucoseSymptom,
	type GlucoseThresholds,
	type GlucoseUnit,
} from '@/lib/blood-glucose';
import GlucoseEntryForm, {
	emptyGlucoseForm,
	glucoseFormToPayload,
	type GlucoseFormValues,
} from './GlucoseEntryForm';
import {
	GLUCOSE_STATUS_CHIP,
	formatClock,
	formatDateTime,
	formatDay,
	toLocalInputValue,
} from './glucosePresentation';
import {printGlucoseLogSheet} from './printGlucoseLogSheet';

export interface GlucoseLogEntry {
	id: string;
	residentId: string;
	residentName?: string;
	location: string;
	operationalDate: string;
	checkedAt: string;
	checkType: GlucoseCheckType;
	method: GlucoseCheckMethod;
	refused: boolean;
	refusalReason: string | null;
	readingValue: number | null;
	readingUnit: GlucoseUnit;
	readingMgDl: number | null;
	status: GlucoseStatus;
	thresholds: GlucoseThresholds;
	symptoms: GlucoseSymptom[];
	actionsTaken: GlucoseAction[];
	notifiedWho: string | null;
	insulinGiven: boolean;
	insulinType: string | null;
	insulinUnits: number | null;
	recheckDueAt: string | null;
	recheckOfId: string | null;
	recheckId: string | null;
	notes: string | null;
	staffId: string;
	staffNameSnapshot: string;
	loggedAt: string;
	updatedAt: string | null;
	reviewedAt: string | null;
	reviewedByName: string | null;
	reviewComment: string | null;
}

interface ResidentView {
	entries: GlucoseLogEntry[];
	today: {operationalDate: string; slots: SlotState[]};
	settings: {
		thresholds: GlucoseThresholds;
		usingDefaultThresholds: boolean;
		scheduledChecks: string[];
		careInstructions: string | null;
	};
	pendingRechecks: GlucoseLogEntry[];
	viewer: {clerkUserId: string; canReview: boolean};
}

interface Revision {
	id: string;
	previous: Record<string, unknown>;
	reason: string;
	revisedByName: string;
	revisedAt: string;
}

interface Props {
	residentId: string;
	residentName: string;
}

const SLOT_STYLES: Record<SlotState['status'], {card: string; badge: string; label: string}> = {
	logged: {card: 'border-green-300 bg-green-50', badge: 'bg-green-600 text-white', label: 'Logged'},
	open: {card: 'border-amber-300 bg-amber-50', badge: 'bg-amber-500 text-white', label: 'Due now'},
	missed: {card: 'border-red-300 bg-red-50', badge: 'bg-red-600 text-white', label: 'Missed'},
	upcoming: {card: 'border-gray-200 bg-white', badge: 'bg-gray-200 text-gray-700', label: 'Later'},
};

function entryToForm(entry: GlucoseLogEntry): GlucoseFormValues {
	return emptyGlucoseForm({
		checkedAtLocal: toLocalInputValue(new Date(entry.checkedAt)),
		checkType: entry.checkType,
		method: entry.method,
		refused: entry.refused,
		refusalReason: entry.refusalReason ?? '',
		readingValue: entry.readingValue === null ? '' : String(entry.readingValue),
		readingUnit: entry.readingUnit,
		symptoms: entry.symptoms,
		actionsTaken: entry.actionsTaken,
		notifiedWho: entry.notifiedWho ?? '',
		insulinGiven: entry.insulinGiven,
		insulinType: entry.insulinType ?? '',
		insulinUnits: entry.insulinUnits === null ? '' : String(entry.insulinUnits),
		notes: entry.notes ?? '',
	});
}

export function StatusChip({status}: {status: GlucoseStatus}) {
	return (
		<span
			className={`inline-block whitespace-nowrap px-2 py-0.5 rounded-full text-xs font-semibold ${GLUCOSE_STATUS_CHIP[status]}`}>
			{GLUCOSE_STATUS_LABELS[status]}
		</span>
	);
}

/** Symptoms, actions and insulin in a couple of short lines for tables. */
export function EntryDetails({entry}: {entry: GlucoseLogEntry}) {
	const lines: string[] = [];
	if (entry.refused && entry.refusalReason) lines.push(`Not done: ${entry.refusalReason}`);
	if (entry.symptoms.length) {
		lines.push(`Symptoms: ${entry.symptoms.map((s) => SYMPTOM_LABELS[s]).join(', ')}`);
	}
	if (entry.actionsTaken.length) {
		lines.push(`Done: ${entry.actionsTaken.map((a) => ACTION_LABELS[a]).join(', ')}`);
	}
	if (entry.notifiedWho) lines.push(`Notified: ${entry.notifiedWho}`);
	if (entry.insulinGiven) lines.push(`Insulin: ${entry.insulinUnits} units ${entry.insulinType ?? ''}`);
	if (entry.notes) lines.push(entry.notes);
	if (lines.length === 0) return <span className="text-gray-400">None</span>;
	return (
		<>
			{lines.map((line, i) => (
				<span key={i} className="block text-xs text-gray-700">
					{line}
				</span>
			))}
		</>
	);
}

/** Supervisor sign-off dialog, shared with the oversight view. */
export function ReviewDialog({
	entry,
	onClose,
	onReviewed,
}: {
	entry: GlucoseLogEntry;
	onClose: () => void;
	onReviewed: () => void;
}) {
	const [comment, setComment] = useState('');
	const [saving, setSaving] = useState(false);
	const submit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			const res = await fetch(`/api/care/blood-glucose-logs/${entry.id}/review`, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({comment}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || 'Failed to save review');
			toast.success('Marked as reviewed');
			onReviewed();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save review');
		} finally {
			setSaving(false);
		}
	};
	return (
		<Modal titleId="glucose-review-title" onClose={onClose}>
			<form onSubmit={submit} className="space-y-4">
				<h4 id="glucose-review-title" className="font-semibold text-gray-900">
					Review {entry.residentName ? `${entry.residentName}'s ` : ''}reading
				</h4>
				<p className="text-sm text-gray-700">
					{formatDateTime(entry.checkedAt)} · {CHECK_TYPE_LABELS[entry.checkType]} ·{' '}
					<strong>{formatGlucoseReading(entry)}</strong> <StatusChip status={entry.status} />
				</p>
				<div className="text-sm">
					<EntryDetails entry={entry} />
				</div>
				<div>
					<label htmlFor="glucose-review-comment" className="block text-sm font-medium mb-1">
						Comment <span className="text-gray-400 font-normal">(optional)</span>
					</label>
					<textarea
						id="glucose-review-comment"
						value={comment}
						onChange={(e) => setComment(e.target.value)}
						rows={3}
						placeholder="e.g. Spoke with the nurse; orders followed"
						className="w-full border rounded px-3 py-2"
					/>
				</div>
				<div className="flex justify-end gap-2">
					<button
						type="button"
						onClick={onClose}
						className="px-4 py-2 min-h-[44px] rounded border border-gray-300 hover:bg-gray-50">
						Cancel
					</button>
					<button
						type="submit"
						disabled={saving}
						className="px-4 py-2 min-h-[44px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
						{saving ? 'Saving…' : 'Mark reviewed'}
					</button>
				</div>
			</form>
		</Modal>
	);
}

export function Modal({
	titleId,
	onClose,
	children,
	wide,
}: {
	titleId: string;
	onClose: () => void;
	children: React.ReactNode;
	wide?: boolean;
}) {
	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [onClose]);
	return (
		<div
			className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-4 overflow-y-auto"
			role="dialog"
			aria-modal="true"
			aria-labelledby={titleId}>
			<div
				className={`bg-white rounded-lg shadow-xl w-full ${
					wide ? 'max-w-3xl' : 'max-w-md'
				} p-5 my-8`}>
				{children}
			</div>
		</div>
	);
}

function RevisionsDialog({entry, onClose}: {entry: GlucoseLogEntry; onClose: () => void}) {
	const [revisions, setRevisions] = useState<Revision[] | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		(async () => {
			try {
				const res = await fetch(`/api/care/blood-glucose-logs/${entry.id}/revisions`);
				const data = await res.json().catch(() => ({}));
				if (!res.ok) throw new Error(data.error || 'Failed to load history');
				if (!cancelled) setRevisions(data.revisions || []);
			} catch (err) {
				if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load history');
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [entry.id]);

	return (
		<Modal titleId="glucose-history-title" onClose={onClose} wide>
			<h4 id="glucose-history-title" className="font-semibold text-gray-900 mb-1">
				Change history
			</h4>
			<p className="text-sm text-gray-600 mb-4">
				Now: {formatDateTime(entry.checkedAt)} · {CHECK_TYPE_LABELS[entry.checkType]} ·{' '}
				{formatGlucoseReading(entry)}
			</p>
			{error ? (
				<p className="text-sm text-red-700">{error}</p>
			) : revisions === null ? (
				<p className="text-sm text-gray-500">Loading…</p>
			) : revisions.length === 0 ? (
				<p className="text-sm text-gray-500">This entry has not been changed.</p>
			) : (
				<ol className="space-y-3">
					{revisions.map((rev) => {
						const prev = rev.previous;
						const prevUnit = isGlucoseUnit(prev.readingUnit) ? prev.readingUnit : 'mg_dl';
						const prevStatus = prev.status as GlucoseStatus;
						return (
							<li key={rev.id} className="rounded border p-3 text-sm">
								<p className="font-medium text-gray-900">
									Changed by {rev.revisedByName} on {formatDateTime(rev.revisedAt)}
								</p>
								<p className="text-gray-700">Reason: {rev.reason}</p>
								<p className="text-gray-600 mt-1">
									Before the change:{' '}
									{typeof prev.checkedAt === 'string' && formatDateTime(prev.checkedAt)} ·{' '}
									{CHECK_TYPE_LABELS[prev.checkType as GlucoseCheckType] ?? String(prev.checkType)} ·{' '}
									{formatGlucoseReading({
										refused: prev.refused === true,
										readingValue: typeof prev.readingValue === 'number' ? prev.readingValue : null,
										readingUnit: prevUnit,
									})}{' '}
									{GLUCOSE_STATUS_LABELS[prevStatus] && <StatusChip status={prevStatus} />}
								</p>
								{prev.insulinGiven === true && (
									<p className="text-gray-600">
										Insulin: {String(prev.insulinUnits)} units {String(prev.insulinType ?? '')}
									</p>
								)}
								{typeof prev.notes === 'string' && prev.notes && (
									<p className="text-gray-600">Notes: {prev.notes}</p>
								)}
							</li>
						);
					})}
				</ol>
			)}
			<div className="flex justify-end mt-4">
				<button
					type="button"
					onClick={onClose}
					className="px-4 py-2 min-h-[44px] rounded border border-gray-300 hover:bg-gray-50">
					Close
				</button>
			</div>
		</Modal>
	);
}

export default function GlucoseLogWorkspace({residentId, residentName}: Props) {
	const [view, setView] = useState<ResidentView | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);
	const [printing, setPrinting] = useState(false);
	// Bumping the key remounts the form with fresh initial values.
	const [formKey, setFormKey] = useState(0);
	const [formInitial, setFormInitial] = useState<GlucoseFormValues>(() => emptyGlucoseForm());
	const [editing, setEditing] = useState<GlucoseLogEntry | null>(null);
	const [rechecking, setRechecking] = useState<GlucoseLogEntry | null>(null);
	const [reviewing, setReviewing] = useState<GlucoseLogEntry | null>(null);
	const [historyOf, setHistoryOf] = useState<GlucoseLogEntry | null>(null);

	const load = useCallback(async () => {
		try {
			const res = await fetch(`/api/care/blood-glucose-logs?residentId=${residentId}`);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || 'Failed to load blood sugar log');
			setView(data);
			setLoadError(null);
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'Failed to load blood sugar log');
		} finally {
			setLoading(false);
		}
	}, [residentId]);

	useEffect(() => {
		load();
	}, [load]);

	const loggedToday = useMemo(
		() =>
			new Set(
				(view?.entries ?? [])
					.filter((e) => e.operationalDate === view?.today.operationalDate)
					.map((e) => e.checkType)
			),
		[view]
	);

	const resetForm = (overrides: Partial<GlucoseFormValues> = {}) => {
		setFormInitial(emptyGlucoseForm(overrides));
		setFormKey((k) => k + 1);
	};

	const canEdit = (entry: GlucoseLogEntry) =>
		!!view &&
		(view.viewer.canReview ||
			(entry.staffId === view.viewer.clerkUserId &&
				Date.now() - new Date(entry.loggedAt).getTime() <=
					AUTHOR_EDIT_WINDOW_MINUTES * 60_000));

	const post = async (values: GlucoseFormValues, recheckOfId?: string) => {
		setSaving(true);
		try {
			const res = await fetch('/api/care/blood-glucose-logs', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					residentId,
					...glucoseFormToPayload(values),
					...(recheckOfId ? {recheckOfId, checkType: 'recheck'} : {}),
				}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || 'Failed to save');
			const status = data.status as GlucoseStatus;
			if (isCritical(status)) {
				toast.warning(`Saved: ${GLUCOSE_STATUS_LABELS[status]}. A recheck is now due.`);
			} else {
				toast.success('Blood sugar check saved');
			}
			return true;
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save');
			return false;
		} finally {
			setSaving(false);
		}
	};

	const handleCreate = async (values: GlucoseFormValues) => {
		if (await post(values)) {
			resetForm();
			await load();
		}
	};

	const handleRecheck = async (values: GlucoseFormValues) => {
		if (!rechecking) return;
		if (await post(values, rechecking.id)) {
			setRechecking(null);
			await load();
		}
	};

	const handleEdit = async (values: GlucoseFormValues) => {
		if (!editing) return;
		setSaving(true);
		try {
			const res = await fetch(`/api/care/blood-glucose-logs/${editing.id}`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(glucoseFormToPayload(values)),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || 'Failed to update');
			toast.success('Entry updated');
			setEditing(null);
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to update');
		} finally {
			setSaving(false);
		}
	};

	const handlePrint = async () => {
		if (!view) return;
		setPrinting(true);
		try {
			const [y, m] = view.today.operationalDate.split('-').map(Number);
			const from = `${y}-${String(m).padStart(2, '0')}-01`;
			const lastDay = new Date(y, m, 0).getDate();
			const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
			const res = await fetch(
				`/api/care/blood-glucose-logs?residentId=${residentId}&from=${from}&to=${to}`
			);
			if (!res.ok) throw new Error('Failed to load month');
			const data: ResidentView = await res.json();
			await printGlucoseLogSheet({
				residentName,
				monthLabel: new Date(y, m - 1, 1).toLocaleDateString(undefined, {
					month: 'long',
					year: 'numeric',
				}),
				thresholds: data.settings.thresholds,
				entries: data.entries,
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to print');
		} finally {
			setPrinting(false);
		}
	};

	if (loading) {
		return <div className="p-6 text-gray-500">Loading blood sugar log…</div>;
	}
	if (loadError || !view) {
		return (
			<div className="p-4 rounded border border-red-200 bg-red-50 text-red-800 flex items-center justify-between gap-4">
				<span>{loadError}</span>
				<button
					type="button"
					onClick={() => {
						setLoading(true);
						load();
					}}
					className="px-3 py-1.5 rounded border border-red-400 text-sm font-medium hover:bg-red-100">
					Retry
				</button>
			</div>
		);
	}

	const {settings, today, pendingRechecks, entries, viewer} = view;
	const t = settings.thresholds;

	return (
		<div className="space-y-6">
			{/* Limits and instructions */}
			<section className="rounded-lg border bg-gray-50 p-4">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="text-sm text-gray-800 space-y-1">
						<p>
							<span className="font-semibold">Critical:</span> below {t.criticalLow} or above{' '}
							{t.criticalHigh} mg/dL
						</p>
						{settings.usingDefaultThresholds && (
							<p className="text-xs text-amber-800">
								These are the facility defaults. A supervisor can set this resident&apos;s own
								limits on their profile.
							</p>
						)}
					</div>
					<button
						type="button"
						onClick={handlePrint}
						disabled={printing}
						className="px-3 py-1.5 text-sm rounded border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50">
						{printing ? 'Preparing…' : '🖨 Print month'}
					</button>
				</div>
				{settings.careInstructions && (
					<div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900 whitespace-pre-line">
						<span className="font-semibold block">Physician instructions</span>
						{settings.careInstructions}
					</div>
				)}
			</section>

			{/* Rechecks owed */}
			{pendingRechecks.length > 0 && (
				<section className="space-y-2" aria-label="Rechecks due">
					{pendingRechecks.map((entry) => {
						const overdue = entry.recheckDueAt && new Date(entry.recheckDueAt).getTime() < Date.now();
						return (
							<div
								key={entry.id}
								className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 ${
									overdue ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50'
								}`}>
								<p className="text-sm text-gray-900">
									<StatusChip status={entry.status} />{' '}
									<strong>{formatGlucoseReading(entry)}</strong> at {formatClock(entry.checkedAt)}.{' '}
									Recheck {overdue ? 'was due' : 'due'} at{' '}
									<strong>{entry.recheckDueAt && formatClock(entry.recheckDueAt)}</strong>
									{overdue ? ' (overdue)' : ''}.
								</p>
								<button
									type="button"
									onClick={() => setRechecking(entry)}
									className="px-4 py-2 min-h-[44px] rounded bg-blue-600 text-white text-sm hover:bg-blue-700">
									Log recheck
								</button>
							</div>
						);
					})}
				</section>
			)}

			{/* Today's scheduled checks */}
			{today.slots.length > 0 && (
				<section>
					<h3 className="text-lg font-semibold text-gray-900 mb-3">
						Today · {formatDay(today.operationalDate)}
					</h3>
					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
						{today.slots.map(({slot, status}) => {
							const style = SLOT_STYLES[status];
							const entry = entries.find(
								(e) => e.operationalDate === today.operationalDate && e.checkType === slot.key
							);
							return (
								<div key={slot.key} className={`rounded-lg border p-3 ${style.card}`}>
									<div className="flex items-center justify-between gap-1">
										<span className="font-medium text-gray-900 text-sm">{slot.label}</span>
										<span className={`text-xs px-2 py-0.5 rounded-full ${style.badge}`}>
											{style.label}
										</span>
									</div>
									<p className="text-xs text-gray-500 mt-0.5">
										{slot.from} to {slot.to}
									</p>
									{entry ? (
										<p className="mt-2 text-sm">
											<span className="font-semibold">{formatGlucoseReading(entry)}</span>{' '}
											<StatusChip status={entry.status} />
										</p>
									) : (
										<button
											type="button"
											onClick={() => {
												resetForm({checkType: slot.key as GlucoseCheckType});
												document
													.getElementById('glucose-new')
													?.scrollIntoView({behavior: 'smooth', block: 'start'});
											}}
											className="mt-2 text-sm text-blue-700 hover:underline">
											Log now →
										</button>
									)}
								</div>
							);
						})}
					</div>
				</section>
			)}

			{/* New check */}
			<section id="glucose-new" className="bg-white rounded-lg border p-4">
				<h4 className="font-semibold text-gray-900 mb-3">Log a blood sugar check</h4>
				<GlucoseEntryForm
					key={formKey}
					idPrefix="glucose-new"
					mode="create"
					initial={formInitial}
					thresholds={t}
					saving={saving}
					submitLabel="Save check"
					onSubmit={handleCreate}
					loggedToday={loggedToday}
				/>
			</section>

			{/* History */}
			<section>
				<h4 className="font-semibold text-gray-900 mb-2">Last 14 days</h4>
				{entries.length === 0 ? (
					<p className="text-sm text-gray-500">No checks logged yet.</p>
				) : (
					<div className="overflow-x-auto rounded-lg border">
						<table className="min-w-full text-sm">
							<thead className="bg-gray-50 text-left text-gray-600">
								<tr>
									<th className="px-3 py-2 font-medium">When</th>
									<th className="px-3 py-2 font-medium">Check</th>
									<th className="px-3 py-2 font-medium">Reading</th>
									<th className="px-3 py-2 font-medium">Details</th>
									<th className="px-3 py-2 font-medium">Logged by</th>
									<th className="px-3 py-2 font-medium">Review</th>
									<th className="px-3 py-2"></th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{entries.map((entry) => (
									<tr
										key={entry.id}
										className={isCritical(entry.status) ? 'bg-red-50/40' : ''}>
										<td className="px-3 py-2 whitespace-nowrap">
											{formatDay(entry.operationalDate)}
											<span className="block text-xs text-gray-500">
												{formatClock(entry.checkedAt)}
											</span>
										</td>
										<td className="px-3 py-2">{CHECK_TYPE_LABELS[entry.checkType]}</td>
										<td className="px-3 py-2 whitespace-nowrap">
											<span className="font-semibold">{formatGlucoseReading(entry)}</span>
											<span className="block mt-0.5">
												<StatusChip status={entry.status} />
											</span>
											{entry.recheckDueAt && !entry.recheckId && (
												<span className="block text-xs text-red-700 mt-0.5">No recheck logged</span>
											)}
										</td>
										<td className="px-3 py-2 min-w-[14rem]">
											<EntryDetails entry={entry} />
										</td>
										<td className="px-3 py-2 text-gray-600 whitespace-nowrap">
											{entry.staffNameSnapshot}
											{entry.updatedAt && (
												<button
													type="button"
													onClick={() => setHistoryOf(entry)}
													className="block text-xs text-blue-700 hover:underline">
													edited · history
												</button>
											)}
										</td>
										<td className="px-3 py-2 text-xs text-gray-600">
											{entry.reviewedAt ? (
												<>
													✓ {entry.reviewedByName}
													<span className="block text-gray-400">
														{formatDateTime(entry.reviewedAt)}
													</span>
													{entry.reviewComment && (
														<span className="block text-gray-600">{entry.reviewComment}</span>
													)}
												</>
											) : viewer.canReview ? (
												<button
													type="button"
													onClick={() => setReviewing(entry)}
													className="text-blue-700 hover:underline">
													Review
												</button>
											) : (
												<span className="text-gray-400">Not yet</span>
											)}
										</td>
										<td className="px-3 py-2 text-right whitespace-nowrap space-x-3">
											{entry.recheckDueAt && !entry.recheckId && (
												<button
													type="button"
													onClick={() => setRechecking(entry)}
													className="text-blue-700 hover:underline">
													Log recheck
												</button>
											)}
											{canEdit(entry) && (
												<button
													type="button"
													onClick={() => setEditing(entry)}
													className="text-blue-700 hover:underline">
													Edit
												</button>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{rechecking && (
				<Modal titleId="glucose-recheck-title" onClose={() => setRechecking(null)} wide>
					<h4 id="glucose-recheck-title" className="font-semibold text-gray-900 mb-1">
						Recheck
					</h4>
					<p className="text-sm text-gray-600 mb-4">
						Following up the {GLUCOSE_STATUS_LABELS[rechecking.status].toLowerCase()} reading of{' '}
						{formatGlucoseReading(rechecking)} at {formatDateTime(rechecking.checkedAt)}.
					</p>
					<GlucoseEntryForm
						idPrefix="glucose-recheck"
						mode="recheck"
						initial={emptyGlucoseForm({
							checkType: 'recheck',
							readingUnit: rechecking.readingUnit,
							method: rechecking.method,
						})}
						thresholds={t}
						saving={saving}
						submitLabel="Save recheck"
						onSubmit={handleRecheck}
						onCancel={() => setRechecking(null)}
					/>
				</Modal>
			)}

			{editing && (
				<Modal titleId="glucose-edit-title" onClose={() => setEditing(null)} wide>
					<h4 id="glucose-edit-title" className="font-semibold text-gray-900 mb-4">
						Edit check · {formatDateTime(editing.checkedAt)}
					</h4>
					<GlucoseEntryForm
						idPrefix="glucose-edit"
						mode="edit"
						initial={entryToForm(editing)}
						thresholds={editing.thresholds}
						saving={saving}
						submitLabel="Save changes"
						onSubmit={handleEdit}
						onCancel={() => setEditing(null)}
					/>
				</Modal>
			)}

			{reviewing && (
				<ReviewDialog
					entry={reviewing}
					onClose={() => setReviewing(null)}
					onReviewed={() => {
						setReviewing(null);
						load();
					}}
				/>
			)}

			{historyOf && <RevisionsDialog entry={historyOf} onClose={() => setHistoryOf(null)} />}
		</div>
	);
}
