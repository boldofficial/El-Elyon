'use client';

// src/components/shared/OverdueTasksBanner.tsx
//
// The conspicuous banner for tasks that passed their due date without being
// done. Rendered above the content of every portal view, so it is the first
// thing a person sees after logging in.
//
// "Non-dismissible" means there is no close control and no client-side
// dismissal state at all: a task leaves the banner only when the server stops
// returning it (done, or cancelled by a supervisor/admin). It never blocks
// clock-in or any other work.
//
// Who sees which task is decided by `showsOnOverdueBanner` in lib/tasks.ts.

import React, {useCallback, useEffect, useState} from 'react';
import type {TaskAlerts, TaskDto} from '@/db/queries/tasks';

/** Fired by the Tasks screen after any change, so the banner updates at once. */
export const TASKS_CHANGED_EVENT = 'tasks:changed';

export function announceTasksChanged() {
	if (typeof window !== 'undefined') {
		window.dispatchEvent(new Event(TASKS_CHANGED_EVENT));
	}
}

const REFRESH_MS = 60_000;
const MAX_LISTED = 5;

interface Props {
	/** Opens the Tasks screen. Omit where the viewer cannot navigate there yet. */
	onOpenTasks?: () => void;
	/** Shown in place of the button when `onOpenTasks` is not available. */
	lockedHint?: string;
}

function lateness(task: TaskDto) {
	return `overdue ${task.daysOverdue} day${task.daysOverdue === 1 ? '' : 's'}`;
}

export default function OverdueTasksBanner({onOpenTasks, lockedHint}: Props) {
	const [overdue, setOverdue] = useState<TaskDto[]>([]);

	const refresh = useCallback(async () => {
		try {
			const res = await fetch('/api/care/tasks?alerts=1');
			if (!res.ok) return; // keep showing what we last knew
			const data: TaskAlerts = await res.json();
			setOverdue(data.overdueTasks || []);
		} catch {
			// Offline or mid-deploy: keep the last known list rather than hiding it.
		}
	}, []);

	useEffect(() => {
		// First load is scheduled, not called inline, so the effect itself only
		// subscribes; state changes arrive from the callbacks.
		const first = setTimeout(refresh, 0);
		const interval = setInterval(refresh, REFRESH_MS);
		window.addEventListener(TASKS_CHANGED_EVENT, refresh);
		window.addEventListener('focus', refresh);
		return () => {
			clearTimeout(first);
			clearInterval(interval);
			window.removeEventListener(TASKS_CHANGED_EVENT, refresh);
			window.removeEventListener('focus', refresh);
		};
	}, [refresh]);

	if (overdue.length === 0) return null;

	const listed = overdue.slice(0, MAX_LISTED);
	const extra = overdue.length - listed.length;

	return (
		<div
			role="alert"
			className="mb-6 rounded-lg border-2 border-red-600 bg-red-50 shadow-sm overflow-hidden">
			<div className="flex flex-col gap-2 bg-red-600 px-4 py-3 text-white sm:flex-row sm:items-center">
				<p className="flex-1 text-base font-bold">
					<span aria-hidden="true" className="mr-2">
						⚠️
					</span>
					{overdue.length === 1
						? '1 task is overdue'
						: `${overdue.length} tasks are overdue`}
				</p>
				{onOpenTasks ? (
					<button
						type="button"
						onClick={onOpenTasks}
						className="min-h-[44px] rounded-lg bg-white px-4 py-2 font-semibold text-red-700 hover:bg-red-100">
						Open tasks
					</button>
				) : (
					lockedHint && <p className="text-sm font-medium">{lockedHint}</p>
				)}
			</div>
			<ul className="divide-y divide-red-200">
				{listed.map((task) => (
					<li key={task.id} className="px-4 py-2 text-sm text-red-900">
						<span className="font-semibold">{task.kindLabel}:</span> {task.title}
						<span className="font-semibold"> · {lateness(task)}</span>
						<span className="text-red-800">
							{' · '}
							{task.location}
							{task.residentName ? ` · ${task.residentName}` : ''}
							{task.assignedName ? ` · for ${task.assignedName}` : ''}
						</span>
					</li>
				))}
				{extra > 0 && (
					<li className="px-4 py-2 text-sm font-medium text-red-900">
						and {extra} more
					</li>
				)}
			</ul>
		</div>
	);
}
