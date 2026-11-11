'use client';

// src/components/shared/TasksWorkspace.tsx
//
// The tasks hub screen, shared by the care portal (staff, supervisors) and the
// admin portal. One-off, non-routine work for a home: list it, add it, tick it
// off. Every rule about who may see or do what is decided on the server
// (lib/tasks.ts via db/queries|mutations/tasks.ts); this component only shows
// the buttons the server says the caller may use (`canComplete`,
// `canEditOrCancel`) and reports the server's answer when it says no.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import type {
	TaskAssigneeOption,
	TaskDto,
	TaskFormMeta,
	TaskHomeOptions,
} from '@/db/queries/tasks';
import {announceTasksChanged} from './OverdueTasksBanner';
import {TASK_KINDS, TASK_TEXT_MAX, TASK_TITLE_MAX, type TaskVisibility} from '@/lib/tasks';

type View = 'open' | 'history';

type FormState = {
	id: string | null;
	title: string;
	kind: string;
	location: string;
	dueDate: string;
	dueTime: string;
	residentId: string;
	assignedStaffId: string;
	visibility: TaskVisibility;
	description: string;
};

const INPUT =
	'w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500';
const LABEL = 'block text-sm font-medium text-gray-700 mb-1';

const VISIBILITY_LABELS: Record<TaskVisibility, string> = {
	home: 'Everyone at the home',
	assignee: 'Only the named person',
	supervisors: 'Supervisors only',
};

function formatDay(isoDate: string) {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
		year: 'numeric',
	});
}

function formatTime(hhmm: string) {
	const [h, m] = hhmm.split(':').map(Number);
	return new Date(2000, 0, 1, h, m).toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	});
}

function formatStamp(iso: string) {
	return new Date(iso).toLocaleString(undefined, {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	});
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, init);
	const data = await res.json().catch(() => ({}));
	if (!res.ok) throw new Error(data.error || 'Something went wrong');
	return data as T;
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
	method,
	headers: {'Content-Type': 'application/json'},
	body: JSON.stringify(body),
});

interface Props {
	/**
	 * Show only tasks about one resident (the resident page's Tasks tab). New
	 * tasks start with that resident and their home already filled in.
	 */
	resident?: {id: string; name: string; location: string};
}

export default function TasksWorkspace({resident}: Props = {}) {
	const [meta, setMeta] = useState<TaskFormMeta | null>(null);
	const [view, setView] = useState<View>('open');
	const [filterLocation, setFilterLocation] = useState('');
	const [filterKind, setFilterKind] = useState('');
	const [tasks, setTasks] = useState<TaskDto[]>([]);
	const [today, setToday] = useState('');
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const [form, setForm] = useState<FormState | null>(null);
	const [homeOptions, setHomeOptions] = useState<TaskHomeOptions | null>(null);
	const [saving, setSaving] = useState(false);
	const [completing, setCompleting] = useState<TaskDto | null>(null);
	const [completionNote, setCompletionNote] = useState('');
	const [cancelling, setCancelling] = useState<TaskDto | null>(null);

	const isStaff = meta?.role === 'staff';
	const homes = meta?.locations ?? [];
	const residentId = resident?.id;

	const fetchTasks = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams({view});
			if (filterLocation) params.set('location', filterLocation);
			if (filterKind) params.set('kind', filterKind);
			if (residentId) params.set('residentId', residentId);
			const data = await api<{today: string; tasks: TaskDto[]}>(
				`/api/care/tasks?${params.toString()}`
			);
			setTasks(data.tasks);
			setToday(data.today);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Failed to load tasks');
		} finally {
			setLoading(false);
		}
	}, [view, filterLocation, filterKind, residentId]);

	useEffect(() => {
		fetchTasks();
	}, [fetchTasks]);

	useEffect(() => {
		api<TaskFormMeta>('/api/care/tasks?meta=1')
			.then(setMeta)
			.catch(() => setMeta({role: '', locations: []}));
	}, []);

	// Pickers (people, residents) belong to one home; reload when it changes.
	const formLocation = form?.location ?? '';
	useEffect(() => {
		if (!formLocation) {
			setHomeOptions(null);
			return;
		}
		let stale = false;
		setHomeOptions(null);
		api<TaskHomeOptions>(`/api/care/tasks?optionsFor=${encodeURIComponent(formLocation)}`)
			.then((options) => !stale && setHomeOptions(options))
			.catch(() => !stale && setHomeOptions({assignees: [], residents: []}));
		return () => {
			stale = true;
		};
	}, [formLocation]);

	const groups = useMemo(() => {
		if (view === 'history') return [{key: 'history', label: '', tone: '', items: tasks}];
		return [
			{
				key: 'overdue',
				label: 'Overdue',
				tone: 'text-red-700',
				items: tasks.filter((t) => t.timing === 'overdue'),
			},
			{
				key: 'today',
				label: 'Due today',
				tone: 'text-amber-700',
				items: tasks.filter((t) => t.timing === 'due_today'),
			},
			{
				key: 'upcoming',
				label: 'Upcoming',
				tone: 'text-gray-700',
				items: tasks.filter((t) => t.timing === 'upcoming'),
			},
		].filter((group) => group.items.length > 0);
	}, [tasks, view]);

	const openNewForm = () =>
		setForm({
			id: null,
			title: '',
			kind: '',
			location:
				resident?.location || filterLocation || (homes.length === 1 ? homes[0] : ''),
			dueDate: today,
			dueTime: '',
			residentId: resident?.id ?? '',
			assignedStaffId: '',
			visibility: 'home',
			description: '',
		});

	const openEditForm = (task: TaskDto) =>
		setForm({
			id: task.id,
			title: task.title,
			kind: task.kind,
			location: task.location,
			dueDate: task.dueDate,
			dueTime: task.dueTime ?? '',
			residentId: task.residentId ?? '',
			assignedStaffId: task.assignedStaffId ?? '',
			visibility: task.visibility,
			description: task.description ?? '',
		});

	const patchForm = (patch: Partial<FormState>) =>
		setForm((current) => (current ? {...current, ...patch} : current));

	// A supervisors-only task cannot be given to a staff member, who could not see it.
	const assigneeChoices: TaskAssigneeOption[] = (homeOptions?.assignees ?? []).filter(
		(person) => form?.visibility !== 'supervisors' || person.role !== 'staff'
	);

	const submitForm = async (event: React.FormEvent) => {
		event.preventDefault();
		if (!form) return;
		setSaving(true);
		try {
			const body = {
				title: form.title,
				kind: form.kind,
				location: form.location,
				dueDate: form.dueDate,
				dueTime: form.dueTime || null,
				residentId: form.residentId || null,
				assignedStaffId: form.assignedStaffId || null,
				visibility: form.visibility,
				description: form.description || null,
			};
			if (form.id) {
				await api(`/api/care/tasks/${form.id}`, jsonInit('PATCH', body));
				toast.success('Task updated');
			} else {
				await api('/api/care/tasks', jsonInit('POST', body));
				toast.success('Task created');
			}
			setForm(null);
			announceTasksChanged();
			await fetchTasks();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not save the task');
		} finally {
			setSaving(false);
		}
	};

	const confirmComplete = async () => {
		if (!completing) return;
		setSaving(true);
		try {
			await api(
				`/api/care/tasks/${completing.id}/complete`,
				jsonInit('POST', {note: completionNote || null})
			);
			toast.success('Task marked as done');
			setCompleting(null);
			setCompletionNote('');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not complete the task');
			setCompleting(null);
		} finally {
			setSaving(false);
			announceTasksChanged();
			await fetchTasks();
		}
	};

	const confirmCancel = async () => {
		if (!cancelling) return;
		setSaving(true);
		try {
			await api(`/api/care/tasks/${cancelling.id}`, jsonInit('PATCH', {action: 'cancel'}));
			toast.success('Task cancelled');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Could not cancel the task');
		} finally {
			setCancelling(null);
			setSaving(false);
			announceTasksChanged();
			await fetchTasks();
		}
	};

	const renderTask = (task: TaskDto) => {
		const overdue = task.status === 'open' && task.timing === 'overdue';
		return (
			<li
				key={task.id}
				className={`p-4 flex flex-col md:flex-row md:items-start gap-3 ${
					overdue ? 'bg-red-50/60' : ''
				}`}>
				<div className="flex-1 min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-semibold text-gray-900 break-words">{task.title}</span>
						<span className="px-2 py-0.5 text-xs rounded-full bg-blue-50 text-blue-700 border border-blue-100">
							{task.kindLabel}
						</span>
						{task.visibility !== 'home' && (
							<span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700 border">
								{VISIBILITY_LABELS[task.visibility]}
							</span>
						)}
						{task.status === 'done' && (
							<span className="px-2 py-0.5 text-xs rounded-full bg-green-50 text-green-700 border border-green-200">
								Done
							</span>
						)}
						{task.status === 'cancelled' && (
							<span className="px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600 border">
								Cancelled
							</span>
						)}
					</div>
					<div className={`mt-1 text-sm ${overdue ? 'text-red-700 font-medium' : 'text-gray-600'}`}>
						Due {formatDay(task.dueDate)}
						{task.dueTime ? ` at ${formatTime(task.dueTime)}` : ''}
						{overdue &&
							` · overdue ${task.daysOverdue} day${task.daysOverdue === 1 ? '' : 's'}`}
					</div>
					<div className="mt-1 text-sm text-gray-600">
						{task.location}
						{task.residentName ? ` · ${task.residentName}` : ''}
						{' · '}
						{task.assignedName ? `For ${task.assignedName}` : 'Anyone on shift'}
					</div>
					{task.description && (
						<p className="mt-2 text-sm text-gray-700 whitespace-pre-wrap break-words">
							{task.description}
						</p>
					)}
					<div className="mt-2 text-xs text-gray-500">
						Created by {task.createdByName} · {formatStamp(task.createdAt)}
						{task.completedAt &&
							` · Done by ${task.completedByName ?? 'Unknown'} · ${formatStamp(task.completedAt)}`}
						{task.cancelledAt &&
							` · Cancelled by ${task.cancelledByName ?? 'Unknown'} · ${formatStamp(task.cancelledAt)}`}
					</div>
					{task.completionNote && (
						<p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap break-words">
							<span className="font-medium">Note:</span> {task.completionNote}
						</p>
					)}
				</div>
				{task.status === 'open' && (task.canComplete || task.canEditOrCancel) && (
					<div className="flex flex-wrap gap-2 md:justify-end shrink-0">
						{task.canComplete && (
							<button
								type="button"
								onClick={() => {
									setCompletionNote('');
									setCompleting(task);
								}}
								className="px-3 py-1.5 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700">
								Mark done
							</button>
						)}
						{task.canEditOrCancel && (
							<>
								<button
									type="button"
									onClick={() => openEditForm(task)}
									className="px-3 py-1.5 text-sm font-medium rounded-md border bg-white text-gray-700 hover:bg-gray-50">
									Edit
								</button>
								<button
									type="button"
									onClick={() => setCancelling(task)}
									className="px-3 py-1.5 text-sm font-medium rounded-md border border-red-200 bg-white text-red-700 hover:bg-red-50">
									Cancel task
								</button>
							</>
						)}
					</div>
				)}
			</li>
		);
	};

	return (
		<div className="space-y-4">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 className="text-2xl font-bold text-gray-900">
						{resident ? `Tasks for ${resident.name}` : 'Tasks'}
					</h2>
					<p className="text-sm text-gray-600">
						One-off jobs for the home: appointments, refills, renewals and the like.
					</p>
				</div>
				<button
					type="button"
					onClick={openNewForm}
					disabled={!meta || homes.length === 0}
					className="px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
					+ New task
				</button>
			</div>

			{/* Filters */}
			<div className="bg-white p-4 rounded-lg shadow-sm border grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
				<div>
					<span className={LABEL}>Show</span>
					<div className="inline-flex rounded-md border overflow-hidden">
						{(['open', 'history'] as const).map((option) => (
							<button
								key={option}
								type="button"
								onClick={() => setView(option)}
								aria-pressed={view === option}
								className={`px-4 py-2 text-sm font-medium ${
									view === option
										? 'bg-blue-600 text-white'
										: 'bg-white text-gray-700 hover:bg-gray-50'
								}`}>
								{option === 'open' ? 'Open' : 'History'}
							</button>
						))}
					</div>
				</div>
				{homes.length > 1 && !resident && (
					<div>
						<label htmlFor="task-filter-home" className={LABEL}>
							Home
						</label>
						<select
							id="task-filter-home"
							className={INPUT}
							value={filterLocation}
							onChange={(e) => setFilterLocation(e.target.value)}>
							<option value="">All homes</option>
							{homes.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					</div>
				)}
				<div>
					<label htmlFor="task-filter-kind" className={LABEL}>
						Kind
					</label>
					<select
						id="task-filter-kind"
						className={INPUT}
						value={filterKind}
						onChange={(e) => setFilterKind(e.target.value)}>
						<option value="">All kinds</option>
						{TASK_KINDS.map((kind) => (
							<option key={kind.key} value={kind.key}>
								{kind.label}
							</option>
						))}
					</select>
				</div>
			</div>

			{/* List */}
			<div className="bg-white rounded-lg shadow-sm border overflow-hidden min-h-[200px]">
				{loading ? (
					<div className="flex flex-col items-center justify-center p-12">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
						<p className="text-gray-500">Loading tasks...</p>
					</div>
				) : error ? (
					<div className="p-8 text-center text-red-700">
						<p>{error}</p>
						<button
							type="button"
							onClick={fetchTasks}
							className="mt-3 px-4 py-2 text-sm rounded-md border bg-white text-gray-700 hover:bg-gray-50">
							Try again
						</button>
					</div>
				) : tasks.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						<p className="font-medium">
							{view === 'open' ? 'No open tasks.' : 'No completed or cancelled tasks yet.'}
						</p>
						{view === 'open' && (
							<p className="text-sm mt-1">Use “New task” to add something that needs doing.</p>
						)}
					</div>
				) : (
					groups.map((group) => (
						<section key={group.key}>
							{group.label && (
								<h3
									className={`px-4 py-2 text-sm font-semibold bg-gray-50 border-b border-t first:border-t-0 ${group.tone}`}>
									{group.label} ({group.items.length})
								</h3>
							)}
							<ul className="divide-y">{group.items.map(renderTask)}</ul>
						</section>
					))
				)}
			</div>

			{/* New / edit form */}
			{form && (
				<div
					className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto"
					role="dialog"
					aria-modal="true"
					aria-labelledby="task-form-title">
					<form
						onSubmit={submitForm}
						className="bg-white rounded-lg shadow-xl w-full max-w-2xl my-8 p-6 space-y-4">
						<h3 id="task-form-title" className="text-lg font-semibold text-gray-900">
							{form.id ? 'Edit task' : 'New task'}
						</h3>

						<div>
							<label htmlFor="task-title" className={LABEL}>
								What needs doing?
							</label>
							<input
								id="task-title"
								className={INPUT}
								value={form.title}
								maxLength={TASK_TITLE_MAX}
								required
								autoFocus
								placeholder="e.g. Book dental check-up"
								onChange={(e) => patchForm({title: e.target.value})}
							/>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label htmlFor="task-kind" className={LABEL}>
									Kind
								</label>
								<select
									id="task-kind"
									className={INPUT}
									value={form.kind}
									required
									onChange={(e) => patchForm({kind: e.target.value})}>
									<option value="" disabled>
										Choose a kind
									</option>
									{TASK_KINDS.map((kind) => (
										<option key={kind.key} value={kind.key}>
											{kind.label}
										</option>
									))}
								</select>
							</div>
							<div>
								<label htmlFor="task-home" className={LABEL}>
									Home
								</label>
								<select
									id="task-home"
									className={INPUT}
									value={form.location}
									required
									// A task for another home is a different task.
									disabled={!!form.id || homes.length === 1 || !!resident}
									onChange={(e) =>
										patchForm({
											location: e.target.value,
											residentId: '',
											assignedStaffId: '',
											visibility: form.visibility === 'assignee' ? 'home' : form.visibility,
										})
									}>
									<option value="" disabled>
										Choose a home
									</option>
									{(homes.includes(form.location) || !form.location
										? homes
										: [form.location, ...homes]
									).map((name) => (
										<option key={name} value={name}>
											{name}
										</option>
									))}
								</select>
							</div>
							<div>
								<label htmlFor="task-due-date" className={LABEL}>
									Due date
								</label>
								<input
									id="task-due-date"
									type="date"
									className={INPUT}
									value={form.dueDate}
									min={form.id ? undefined : today}
									required
									onChange={(e) => patchForm({dueDate: e.target.value})}
								/>
							</div>
							<div>
								<label htmlFor="task-due-time" className={LABEL}>
									Time <span className="font-normal text-gray-500">(optional)</span>
								</label>
								<input
									id="task-due-time"
									type="time"
									className={INPUT}
									value={form.dueTime}
									onChange={(e) => patchForm({dueTime: e.target.value})}
								/>
							</div>
							<div>
								<label htmlFor="task-assignee" className={LABEL}>
									Who is this for?
								</label>
								<select
									id="task-assignee"
									className={INPUT}
									value={form.assignedStaffId}
									disabled={!form.location || !homeOptions}
									onChange={(e) =>
										patchForm({
											assignedStaffId: e.target.value,
											visibility:
												!e.target.value && form.visibility === 'assignee'
													? 'home'
													: form.visibility,
										})
									}>
									<option value="">Anyone on shift at the home</option>
									{assigneeChoices.map((person) => (
										<option key={person.clerkUserId} value={person.clerkUserId}>
											{person.name}
										</option>
									))}
								</select>
							</div>
							<div>
								<label htmlFor="task-visibility" className={LABEL}>
									Who can see it?
								</label>
								<select
									id="task-visibility"
									className={INPUT}
									value={form.visibility}
									onChange={(e) => {
										const visibility = e.target.value as TaskVisibility;
										const assignee = homeOptions?.assignees.find(
											(person) => person.clerkUserId === form.assignedStaffId
										);
										patchForm({
											visibility,
											assignedStaffId:
												visibility === 'supervisors' && assignee?.role === 'staff'
													? ''
													: form.assignedStaffId,
										});
									}}>
									<option value="home">{VISIBILITY_LABELS.home}</option>
									<option value="assignee" disabled={!form.assignedStaffId}>
										{VISIBILITY_LABELS.assignee}
										{form.assignedStaffId ? '' : ' (choose a person first)'}
									</option>
									{!isStaff && (
										<option value="supervisors">{VISIBILITY_LABELS.supervisors}</option>
									)}
								</select>
							</div>
							<div className="md:col-span-2">
								<label htmlFor="task-resident" className={LABEL}>
									About a resident{' '}
									<span className="font-normal text-gray-500">(optional)</span>
								</label>
								<select
									id="task-resident"
									className={INPUT}
									value={form.residentId}
									disabled={!form.location || !homeOptions}
									onChange={(e) => patchForm({residentId: e.target.value})}>
									<option value="">No particular resident</option>
									{(homeOptions?.residents ?? []).map((resident) => (
										<option key={resident.id} value={resident.id}>
											{resident.name}
										</option>
									))}
								</select>
							</div>
						</div>

						<div>
							<label htmlFor="task-description" className={LABEL}>
								Details <span className="font-normal text-gray-500">(optional)</span>
							</label>
							<textarea
								id="task-description"
								className={INPUT}
								rows={3}
								maxLength={TASK_TEXT_MAX}
								value={form.description}
								onChange={(e) => patchForm({description: e.target.value})}
							/>
						</div>

						<div className="flex justify-end gap-2 pt-2">
							<button
								type="button"
								onClick={() => setForm(null)}
								disabled={saving}
								className="px-4 py-2 text-sm rounded-md border bg-white text-gray-700 hover:bg-gray-50">
								Close
							</button>
							<button
								type="submit"
								disabled={saving}
								className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
								{saving ? 'Saving...' : form.id ? 'Save changes' : 'Create task'}
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Mark done */}
			{completing && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
					role="dialog"
					aria-modal="true"
					aria-labelledby="task-complete-title">
					<div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
						<h3 id="task-complete-title" className="text-lg font-semibold text-gray-900">
							Mark as done?
						</h3>
						<p className="text-sm text-gray-700 break-words">{completing.title}</p>
						<div>
							<label htmlFor="task-complete-note" className={LABEL}>
								Note <span className="font-normal text-gray-500">(optional)</span>
							</label>
							<textarea
								id="task-complete-note"
								className={INPUT}
								rows={3}
								maxLength={TASK_TEXT_MAX}
								value={completionNote}
								placeholder="e.g. Booked for 3 Dec at 2:30pm"
								onChange={(e) => setCompletionNote(e.target.value)}
							/>
						</div>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setCompleting(null)}
								disabled={saving}
								className="px-4 py-2 text-sm rounded-md border bg-white text-gray-700 hover:bg-gray-50">
								Not yet
							</button>
							<button
								type="button"
								onClick={confirmComplete}
								disabled={saving}
								className="px-4 py-2 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 disabled:opacity-50">
								{saving ? 'Saving...' : 'Mark done'}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Cancel task */}
			{cancelling && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
					role="dialog"
					aria-modal="true"
					aria-labelledby="task-cancel-title">
					<div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
						<h3 id="task-cancel-title" className="text-lg font-semibold text-gray-900">
							Cancel this task?
						</h3>
						<p className="text-sm text-gray-700 break-words">{cancelling.title}</p>
						<p className="text-sm text-gray-600">
							It will move to History marked as cancelled. This cannot be undone.
						</p>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setCancelling(null)}
								disabled={saving}
								className="px-4 py-2 text-sm rounded-md border bg-white text-gray-700 hover:bg-gray-50">
								Keep task
							</button>
							<button
								type="button"
								onClick={confirmCancel}
								disabled={saving}
								className="px-4 py-2 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
								{saving ? 'Cancelling...' : 'Cancel task'}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
