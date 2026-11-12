'use client';

// src/components/care/TaskCalendar.tsx
//
// Month calendar of open tasks, shown beside the clock card on the shift
// screen. Today is a solid blue disc, days with open tasks are amber, days with an
// overdue task are red; each marked day also carries its task count, so the
// meaning never rests on colour alone. Picking a day lists its tasks.
//
// Read-only: tasks are completed and edited on the Tasks screen. It shows
// exactly the tasks the server lets this person see (same endpoint as the
// Tasks screen), and refreshes when a task changes anywhere in the portal.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import type {TaskDto} from '@/db/queries/tasks';
import {
	buildMonthWeeks,
	monthOf,
	sameMonth,
	shiftMonth,
	summarizeTaskDays,
	type CalendarMonth,
} from '@/lib/task-calendar';
import {TASKS_CHANGED_EVENT} from '../shared/OverdueTasksBanner';

interface Props {
	/** Opens the Tasks screen. Omit where the viewer cannot navigate there yet. */
	onOpenTasks?: () => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function monthLabel({year, month}: CalendarMonth) {
	return new Date(year, month - 1, 1).toLocaleDateString(undefined, {
		month: 'long',
		year: 'numeric',
	});
}

function dayLabel(isoDate: string) {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString(undefined, {
		weekday: 'long',
		month: 'long',
		day: 'numeric',
	});
}

function formatTime(hhmm: string) {
	const [h, m] = hhmm.split(':').map(Number);
	return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	});
}

export default function TaskCalendar({onOpenTasks}: Props) {
	const [tasks, setTasks] = useState<TaskDto[]>([]);
	const [today, setToday] = useState('');
	const [month, setMonth] = useState<CalendarMonth | null>(null);
	const [selected, setSelected] = useState('');
	const [failed, setFailed] = useState(false);

	const refresh = useCallback(async () => {
		try {
			const res = await fetch('/api/care/tasks?view=open');
			if (!res.ok) throw new Error('Failed to load tasks');
			const data: {today: string; tasks: TaskDto[]} = await res.json();
			setTasks(data.tasks || []);
			setToday(data.today);
			// First load only: open on the current month with today selected.
			setMonth((current) => current ?? monthOf(data.today));
			setSelected((current) => current || data.today);
			setFailed(false);
		} catch {
			setFailed(true);
		}
	}, []);

	useEffect(() => {
		const first = setTimeout(refresh, 0);
		window.addEventListener(TASKS_CHANGED_EVENT, refresh);
		window.addEventListener('focus', refresh);
		return () => {
			clearTimeout(first);
			window.removeEventListener(TASKS_CHANGED_EVENT, refresh);
			window.removeEventListener('focus', refresh);
		};
	}, [refresh]);

	const days = useMemo(() => summarizeTaskDays(tasks, today), [tasks, today]);
	const weeks = useMemo(() => (month ? buildMonthWeeks(month) : []), [month]);
	const selectedTasks = useMemo(
		() => tasks.filter((task) => task.dueDate === selected),
		[tasks, selected]
	);

	if (!month) {
		return (
			<div className="bg-white rounded-lg shadow-sm border p-6 text-center text-sm text-gray-500">
				{failed ? (
					<>
						<p className="text-red-700">The task calendar could not be loaded.</p>
						<button
							type="button"
							onClick={refresh}
							className="mt-3 px-4 py-2 rounded-md border bg-white text-gray-700 hover:bg-gray-50">
							Try again
						</button>
					</>
				) : (
					'Loading calendar...'
				)}
			</div>
		);
	}

	const onCurrentMonth = sameMonth(month, monthOf(today));

	return (
		<section
			aria-labelledby="task-calendar-title"
			className="bg-white rounded-lg shadow-sm border">
			<div className="px-4 py-3 border-b flex items-center gap-2">
				<h3 id="task-calendar-title" className="font-semibold text-gray-900 flex-1">
					{monthLabel(month)}
				</h3>
				{!onCurrentMonth && (
					<button
						type="button"
						onClick={() => {
							setMonth(monthOf(today));
							setSelected(today);
						}}
						className="px-2.5 py-1 text-xs font-medium rounded-md border text-gray-700 hover:bg-gray-50">
						Today
					</button>
				)}
				<button
					type="button"
					aria-label="Previous month"
					onClick={() => setMonth(shiftMonth(month, -1))}
					className="w-8 h-8 rounded-md border text-gray-700 hover:bg-gray-50">
					‹
				</button>
				<button
					type="button"
					aria-label="Next month"
					onClick={() => setMonth(shiftMonth(month, 1))}
					className="w-8 h-8 rounded-md border text-gray-700 hover:bg-gray-50">
					›
				</button>
			</div>

			<div className="p-3">
				<div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500 mb-1">
					{WEEKDAYS.map((name) => (
						<div key={name}>{name}</div>
					))}
				</div>
				<div className="grid grid-cols-7 gap-1">
					{weeks.flat().map((day) => {
						const summary = days.get(day.date);
						const isToday = day.date === today;
						const isSelected = day.date === selected;
						const tone =
							summary?.mark === 'overdue'
								? 'bg-red-100 text-red-900 border-red-300'
								: summary?.mark === 'due'
									? 'bg-amber-100 text-amber-900 border-amber-300'
									: 'bg-white text-gray-700 border-transparent hover:bg-gray-50';
						const describe = summary
							? `, ${summary.count} task${summary.count === 1 ? '' : 's'}${
									summary.mark === 'overdue' ? ' overdue' : ' due'
								}`
							: '';
						return (
							<button
								key={day.date}
								type="button"
								onClick={() => setSelected(day.date)}
								aria-pressed={isSelected}
								aria-current={isToday ? 'date' : undefined}
								aria-label={`${dayLabel(day.date)}${isToday ? ', today' : ''}${describe}`}
								className={`relative h-11 rounded-md border text-sm transition-colors ${tone} ${
									day.inMonth ? '' : 'opacity-40'
								} ${isSelected ? 'ring-2 ring-gray-900' : ''}`}>
								{/* Today is a solid blue disc, so it stays obvious whatever
								    the day's colour and whether or not it is selected. */}
								<span
									className={
										isToday
											? 'inline-flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 font-bold text-white'
											: ''
									}>
									{day.dayOfMonth}
								</span>
								{summary && (
									<span className="absolute bottom-0.5 right-1 text-[11px] font-semibold leading-none">
										{summary.count}
									</span>
								)}
							</button>
						);
					})}
				</div>

				<div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
					<span className="inline-flex items-center gap-1.5">
						<span className="w-3 h-3 rounded-full bg-blue-600" aria-hidden="true"></span>
						Today
					</span>
					<span className="inline-flex items-center gap-1.5">
						<span
							className="w-3 h-3 rounded-sm bg-amber-100 border border-amber-300"
							aria-hidden="true"></span>
						Tasks due
					</span>
					<span className="inline-flex items-center gap-1.5">
						<span
							className="w-3 h-3 rounded-sm bg-red-100 border border-red-300"
							aria-hidden="true"></span>
						Overdue
					</span>
				</div>
			</div>

			<div className="border-t px-4 py-3">
				<p className="text-sm font-semibold text-gray-900">
					{selected === today ? 'Today' : dayLabel(selected)}
				</p>
				{selectedTasks.length === 0 ? (
					<p className="mt-1 text-sm text-gray-500">No tasks due on this day.</p>
				) : (
					<ul className="mt-2 space-y-2">
						{selectedTasks.map((task) => (
							<li key={task.id} className="flex gap-2">
								{/* Same swatch as the calendar legend, so the dot ties the
								    task back to its day's colour. */}
								<span
									aria-hidden="true"
									className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm border ${
										task.timing === 'overdue'
											? 'bg-red-100 border-red-300'
											: 'bg-amber-100 border-amber-300'
									}`}></span>
								<div className="min-w-0">
								<p className="text-sm font-medium text-gray-900 break-words">{task.title}</p>
								<p className="text-xs text-gray-600">
									{task.kindLabel}
									{task.dueTime ? ` · ${formatTime(task.dueTime)}` : ''}
									{task.residentName ? ` · ${task.residentName}` : ''}
									{task.assignedName ? ` · for ${task.assignedName}` : ' · anyone on shift'}
									{task.timing === 'overdue' && (
										<span className="text-red-700 font-medium">
											{' '}
											· overdue {task.daysOverdue} day{task.daysOverdue === 1 ? '' : 's'}
										</span>
									)}
								</p>
								</div>
							</li>
						))}
					</ul>
				)}
				{onOpenTasks && (
					<button
						type="button"
						onClick={onOpenTasks}
						className="mt-3 text-sm font-medium text-blue-700 hover:underline">
						Open tasks
					</button>
				)}
				{failed && (
					<p className="mt-2 text-xs text-red-700">
						Could not refresh just now. Showing the last tasks loaded.
					</p>
				)}
			</div>
		</section>
	);
}
