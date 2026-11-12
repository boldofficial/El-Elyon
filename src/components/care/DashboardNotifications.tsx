'use client';

// src/components/care/DashboardNotifications.tsx
//
// Notification area shown on the shift dashboard, under the Clock In card.
// Everything the user must see is sorted into three buckets by urgency
// ("Needs attention now", "Due today", "To read") rather than one box per
// feature, so the screen reads top-down in the order things need doing.

import React, {useCallback, useEffect, useState} from 'react';
import {toast} from 'sonner';
import DocumentViewerModal from '@/components/shared/DocumentViewerModal';
import {
	GLUCOSE_STATUS_LABELS,
	formatGlucoseReading,
	isCritical,
	type GlucoseStatus,
	type GlucoseUnit,
} from '@/lib/blood-glucose';
import type {TaskDto} from '@/db/queries/tasks';

interface PendingIspAck {
	ispFileId: string;
	residentId: string;
	residentName: string;
	location: string | null;
	versionLabel: string;
	effectiveDate: string;
	fileName: string;
	fileStorageId: string;
	contentType: string;
}

interface Memo {
	id: string;
	title: string;
	content: string;
	senderName: string;
	priority?: string | null;
	createdAt: string;
}

interface CarbLogReminder {
	residentId: string;
	residentName: string;
	location: string;
	operationalDate: string;
	slots: Array<{slot: {key: string; label: string}; status: 'open' | 'missed'}>;
}

interface GlucoseReminders {
	scheduled: CarbLogReminder[];
	rechecks: Array<{
		logId: string;
		residentId: string;
		residentName: string;
		location: string;
		status: GlucoseStatus;
		checkedAt: string;
		recheckDueAt: string;
	}>;
	unreviewed: Array<{
		logId: string;
		residentId: string;
		residentName: string;
		location: string;
		status: GlucoseStatus;
		readingValue: number | null;
		readingUnit: GlucoseUnit;
		checkedAt: string;
	}>;
}

const EMPTY_GLUCOSE: GlucoseReminders = {scheduled: [], rechecks: [], unreviewed: []};

interface ComplianceReminder {
	id: string;
	type: string;
	title: string;
	description: string;
	location: string;
	severity: string;
	createdAt: string;
}

const REMINDER_ICONS: Record<string, string> = {
	isp: '📄',
	fire_evac: '🚪',
	smoke_detector: '🚨',
	fire_drill: '🧯',
	admission_drill: '🏠',
};

const SEVERITY_ACCENT: Record<string, string> = {
	critical: 'border-red-500',
	high: 'border-orange-400',
	medium: 'border-yellow-400',
	low: 'border-blue-300',
};

const PRIORITY_STYLES: Record<string, string> = {
	urgent: 'bg-red-100 text-red-800 border-red-200',
	high: 'bg-orange-100 text-orange-800 border-orange-200',
	normal: 'bg-blue-100 text-blue-800 border-blue-200',
};

export default function DashboardNotifications() {
	const [pendingIspAcks, setPendingIspAcks] = useState<PendingIspAck[]>([]);
	const [unreadMemos, setUnreadMemos] = useState<Memo[]>([]);
	const [reminders, setReminders] = useState<ComplianceReminder[]>([]);
	const [carbReminders, setCarbReminders] = useState<CarbLogReminder[]>([]);
	const [glucose, setGlucose] = useState<GlucoseReminders>(EMPTY_GLUCOSE);
	// Overdue tasks are not listed here: they have their own banner at the top
	// of the portal (OverdueTasksBanner).
	const [tasksDueToday, setTasksDueToday] = useState<TaskDto[]>([]);
	const [loading, setLoading] = useState(true);
	const [acking, setAcking] = useState<string | null>(null);
	const [viewingIsp, setViewingIsp] = useState<PendingIspAck | null>(null);

	const fetchNotifications = useCallback(async () => {
		try {
			const res = await fetch('/api/care/dashboard-notifications');
			if (!res.ok) throw new Error('Failed to load notifications');
			const data = await res.json();
			setPendingIspAcks(data.pendingIspAcks || []);
			setUnreadMemos(data.unreadMemos || []);
			setReminders(data.complianceReminders || []);
			setCarbReminders(data.carbLogReminders || []);
			setGlucose({...EMPTY_GLUCOSE, ...(data.glucoseReminders || {})});
			setTasksDueToday(data.tasksDueToday || []);
		} catch (error) {
			console.error('Error loading dashboard notifications:', error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchNotifications();
	}, [fetchNotifications]);

	const handleAcknowledge = async (ispFileId: string) => {
		setAcking(ispFileId);
		try {
			const res = await fetch('/api/care/isp-files/acknowledge', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({ispFileId}),
			});
			if (!res.ok) throw new Error('Failed to acknowledge');
			toast.success('ISP acknowledged');
			setPendingIspAcks((prev) =>
				prev.filter((a) => a.ispFileId !== ispFileId)
			);
		} catch (error) {
			console.error('Error acknowledging ISP:', error);
			toast.error('Failed to acknowledge ISP');
		} finally {
			setAcking(null);
		}
	};

	const handleMarkMemoRead = async (memoId: string) => {
		try {
			const res = await fetch(`/api/memos/${memoId}`, {method: 'PATCH'});
			if (!res.ok) throw new Error('Failed to mark read');
			setUnreadMemos((prev) => prev.filter((m) => m.id !== memoId));
		} catch (error) {
			console.error('Error marking memo read:', error);
			toast.error('Failed to mark memo as read');
		}
	};

	// Render nothing until we know there's something to show.
	if (loading) return null;

	const formatTime = (iso: string) =>
		new Date(iso).toLocaleTimeString(undefined, {hour: 'numeric', minute: '2-digit'});

	// ------------------------------------------------------------------
	// Everything is sorted into three buckets by how soon it needs someone,
	// not by which part of the app it came from:
	//   now   – already late, or a safety follow-up (rechecks, missed logs,
	//           out-of-range readings to review, critical/high compliance)
	//   today – due during this shift but not late yet
	//   read  – things to read and acknowledge
	// Overdue tasks are not here: they have their own banner at the top of
	// the portal (OverdueTasksBanner).
	// ------------------------------------------------------------------
	const hasMissed = (r: CarbLogReminder) => r.slots.some((s) => s.status === 'missed');
	const isUrgentReminder = (r: ComplianceReminder) =>
		r.severity === 'critical' || r.severity === 'high';

	const glucoseMissed = glucose.scheduled.filter(hasMissed);
	const glucoseOpen = glucose.scheduled.filter((r) => !hasMissed(r));
	const carbMissed = carbReminders.filter(hasMissed);
	const carbOpen = carbReminders.filter((r) => !hasMissed(r));
	const urgentReminders = reminders.filter(isUrgentReminder);
	const routineReminders = reminders.filter((r) => !isUrgentReminder(r));

	const nowCount =
		glucose.rechecks.length +
		glucose.unreviewed.length +
		glucoseMissed.length +
		carbMissed.length +
		urgentReminders.length;
	const todayCount =
		tasksDueToday.length + glucoseOpen.length + carbOpen.length + routineReminders.length;
	const readCount = pendingIspAcks.length + unreadMemos.length;

	if (nowCount + todayCount + readCount === 0) {
		return (
			<div className="bg-white rounded-lg shadow-sm border p-6 text-center">
				<p className="font-medium text-gray-900">You&apos;re all caught up</p>
				<p className="text-sm text-gray-600 mt-1">
					Nothing needs your attention right now.
				</p>
			</div>
		);
	}

	const slotLine = (r: CarbLogReminder, tab: string) => {
		const missed = r.slots.filter((s) => s.status === 'missed');
		const open = r.slots.filter((s) => s.status === 'open');
		return (
			<>
				{missed.length > 0 && (
					<span className="text-red-700">
						Missed: {missed.map((s) => s.slot.label).join(', ')}
					</span>
				)}
				{missed.length > 0 && open.length > 0 && ' · '}
				{open.length > 0 && <span>Due now: {open.map((s) => s.slot.label).join(', ')}</span>}
				<span className="text-gray-500"> · open the resident&apos;s {tab} tab</span>
			</>
		);
	};

	const scheduledRows = (rows: CarbLogReminder[], source: string, tab: string) =>
		rows.map((r) => (
			<Row
				key={`${source}-${r.residentId}`}
				source={source}
				title={r.residentName}
				meta={r.location}
				accent={hasMissed(r) ? 'border-red-400' : 'border-amber-400'}>
				{slotLine(r, tab)}
			</Row>
		));

	const reminderRows = (rows: ComplianceReminder[]) =>
		rows.map((r) => (
			<Row
				key={`reminder-${r.id}`}
				source={`${REMINDER_ICONS[r.type] || '⚠️'} Compliance`}
				title={r.title}
				meta={r.location}
				accent={SEVERITY_ACCENT[r.severity] || SEVERITY_ACCENT.medium}>
				{r.description}
			</Row>
		));

	return (
		<div className="space-y-4">
			{nowCount > 0 && (
				<Bucket title="Needs attention now" count={nowCount} tone="urgent">
					{glucose.rechecks.map((r) => {
						const overdue = new Date(r.recheckDueAt).getTime() < Date.now();
						return (
							<Row
								key={`recheck-${r.logId}`}
								source="🩸 Blood sugar"
								title={r.residentName}
								meta={r.location}
								accent={overdue ? 'border-red-500' : 'border-amber-400'}>
								<span className={overdue ? 'text-red-700' : ''}>
									Recheck {overdue ? 'overdue' : 'due'} at {formatTime(r.recheckDueAt)} (
									{GLUCOSE_STATUS_LABELS[r.status].toLowerCase()} reading at{' '}
									{formatTime(r.checkedAt)})
								</span>
								<span className="text-gray-500">
									{' '}
									· open the resident&apos;s Blood Sugar tab
								</span>
							</Row>
						);
					})}
					{glucose.unreviewed.map((r) => (
						<Row
							key={`review-${r.logId}`}
							source="🩸 Blood sugar"
							title={r.residentName}
							meta={r.location}
							accent={isCritical(r.status) ? 'border-red-600' : 'border-orange-400'}>
							<span className={isCritical(r.status) ? 'text-red-700 font-semibold' : ''}>
								{GLUCOSE_STATUS_LABELS[r.status]}:{' '}
								{formatGlucoseReading({
									refused: false,
									readingValue: r.readingValue,
									readingUnit: r.readingUnit,
								})}
							</span>{' '}
							on{' '}
							{new Date(r.checkedAt).toLocaleString(undefined, {
								month: 'short',
								day: 'numeric',
								hour: 'numeric',
								minute: '2-digit',
							})}{' '}
							needs your review
							<span className="text-gray-500"> · see Blood Sugar in the menu</span>
						</Row>
					))}
					{scheduledRows(glucoseMissed, '🩸 Blood sugar', 'Blood Sugar')}
					{scheduledRows(carbMissed, '🍞 Carb log', 'Carb Log')}
					{reminderRows(urgentReminders)}
				</Bucket>
			)}

			{todayCount > 0 && (
				<Bucket title="Due today" count={todayCount} tone="today">
					{tasksDueToday.map((task) => (
						<Row
							key={`task-${task.id}`}
							source="📝 Task"
							title={task.title}
							meta={task.location}
							accent="border-amber-400">
							{task.kindLabel}
							{task.dueTime ? ` · at ${formatTime(`2000-01-01T${task.dueTime}:00`)}` : ''}
							{task.residentName ? ` · ${task.residentName}` : ''}
							{task.assignedName ? ` · for ${task.assignedName}` : ' · anyone on shift'}
							<span className="text-gray-500"> · see Tasks in the menu</span>
						</Row>
					))}
					{scheduledRows(glucoseOpen, '🩸 Blood sugar', 'Blood Sugar')}
					{scheduledRows(carbOpen, '🍞 Carb log', 'Carb Log')}
					{reminderRows(routineReminders)}
				</Bucket>
			)}

			{readCount > 0 && (
				<Bucket title="To read" count={readCount} tone="read">
					{pendingIspAcks.map((ack) => (
						<li
							key={`ack-${ack.ispFileId}`}
							className="px-4 py-3 border-l-4 border-blue-300 flex items-center justify-between gap-4">
							<button
								type="button"
								onClick={() => setViewingIsp(ack)}
								className="min-w-0 text-left group">
								<p className="text-xs font-medium text-gray-500">📋 Support plan to acknowledge</p>
								<p className="text-sm font-medium text-gray-900 truncate group-hover:text-blue-700 group-hover:underline">
									{ack.residentName}
									<span className="text-gray-500 font-normal"> · {ack.versionLabel}</span>
								</p>
								<p className="text-xs text-gray-500">
									Effective {new Date(ack.effectiveDate).toLocaleDateString()}
									{ack.location ? ` · ${ack.location}` : ''}
								</p>
							</button>
							<button
								type="button"
								onClick={() => handleAcknowledge(ack.ispFileId)}
								disabled={acking === ack.ispFileId}
								className="flex-shrink-0 px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">
								{acking === ack.ispFileId ? 'Saving...' : 'I have read this'}
							</button>
						</li>
					))}
					{unreadMemos.map((memo) => (
						<li key={`memo-${memo.id}`} className="px-4 py-3 border-l-4 border-blue-300">
							<div className="flex items-start justify-between gap-3">
								<div className="min-w-0">
									<p className="text-xs font-medium text-gray-500">📣 Memo</p>
									<div className="flex items-center gap-2">
										<p className="text-sm font-semibold text-gray-900 truncate">{memo.title}</p>
										{memo.priority && memo.priority !== 'normal' && (
											<span
												className={`text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border ${
													PRIORITY_STYLES[memo.priority] || PRIORITY_STYLES.normal
												}`}>
												{memo.priority}
											</span>
										)}
									</div>
									<p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap line-clamp-3">
										{memo.content}
									</p>
									<p className="text-xs text-gray-500 mt-1">
										{memo.senderName} · {new Date(memo.createdAt).toLocaleDateString()}
									</p>
								</div>
								<button
									type="button"
									onClick={() => handleMarkMemoRead(memo.id)}
									className="flex-shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800">
									Mark read
								</button>
							</div>
						</li>
					))}
				</Bucket>
			)}

			<DocumentViewerModal
				isOpen={!!viewingIsp}
				onClose={() => setViewingIsp(null)}
				document={
					viewingIsp
						? {
								fileStorageId: viewingIsp.fileStorageId,
								fileName: viewingIsp.fileName,
								contentType: viewingIsp.contentType,
							}
						: null
				}
			/>
		</div>
	);
}

const BUCKET_TONES = {
	urgent: {
		card: 'border-red-200',
		header: 'bg-red-50 border-red-100 text-red-900',
		count: 'bg-red-200 text-red-900',
	},
	today: {
		card: 'border-amber-200',
		header: 'bg-amber-50 border-amber-100 text-amber-900',
		count: 'bg-amber-200 text-amber-900',
	},
	read: {
		card: 'border-gray-200',
		header: 'bg-gray-50 border-gray-200 text-gray-900',
		count: 'bg-gray-200 text-gray-800',
	},
} as const;

/**
 * One urgency bucket. A native <details>, so it can be folded away without
 * any state of our own; it starts open because hiding what needs doing would
 * defeat the point.
 */
function Bucket({
	title,
	count,
	tone,
	children,
}: {
	title: string;
	count: number;
	tone: keyof typeof BUCKET_TONES;
	children: React.ReactNode;
}) {
	const styles = BUCKET_TONES[tone];
	return (
		<details open className={`group bg-white rounded-lg shadow-sm border ${styles.card}`}>
			<summary
				className={`px-4 py-3 border-b rounded-t-lg flex items-center gap-2 cursor-pointer list-none [&::-webkit-details-marker]:hidden ${styles.header}`}>
				<h3 className="font-semibold">{title}</h3>
				<span className={`text-xs font-medium px-2 py-0.5 rounded-full ${styles.count}`}>
					{count}
				</span>
				<span
					aria-hidden="true"
					className="ml-auto text-sm transition-transform group-open:rotate-180">
					▾
				</span>
			</summary>
			<ul className="divide-y">{children}</ul>
		</details>
	);
}

/** One line inside a bucket: where it came from, who/what, and what to do. */
function Row({
	source,
	title,
	meta,
	accent,
	children,
}: {
	source: string;
	title: string;
	meta?: string | null;
	accent: string;
	children: React.ReactNode;
}) {
	return (
		<li className={`px-4 py-3 border-l-4 ${accent}`}>
			<p className="text-xs font-medium text-gray-500">{source}</p>
			<p className="text-sm font-medium text-gray-900">
				{title}
				{meta ? <span className="text-gray-500 font-normal"> · {meta}</span> : null}
			</p>
			<p className="text-sm text-gray-600 mt-0.5">{children}</p>
		</li>
	);
}
