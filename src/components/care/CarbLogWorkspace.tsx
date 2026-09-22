'use client';

// src/components/care/CarbLogWorkspace.tsx
//
// Per-meal carbohydrate log for one resident. Shows today's meal slots with
// their server-derived status (logged / open / missed / upcoming), an entry
// form, the recent history, and a printable sheet for a date range.

import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {toast} from 'sonner';
import type {SlotState} from '@/lib/custom-log-schedule';
import {
	CARBS_GRAMS_MAX,
	CARBS_GRAMS_MIN,
	MEAL_SLOTS,
	MEAL_SLOT_LABELS,
	type MealSlot,
} from '@/lib/carb-log';
import {printCarbLogSheet} from './printCarbLogSheet';

export interface CarbLogEntry {
	id: string;
	operationalDate: string;
	mealSlot: MealSlot;
	carbsGrams: number;
	foodDescription: string | null;
	notes: string | null;
	staffId: string;
	staffNameSnapshot: string;
	loggedAt: string;
	updatedAt: string | null;
}

interface DayStatus {
	operationalDate: string;
	slots: SlotState[];
}

interface Props {
	residentId: string;
	residentName: string;
}

const STATUS_STYLES: Record<SlotState['status'], {card: string; badge: string; label: string}> = {
	logged: {
		card: 'border-green-300 bg-green-50',
		badge: 'bg-green-600 text-white',
		label: 'Logged',
	},
	open: {
		card: 'border-amber-300 bg-amber-50',
		badge: 'bg-amber-500 text-white',
		label: 'Due now',
	},
	missed: {
		card: 'border-red-300 bg-red-50',
		badge: 'bg-red-600 text-white',
		label: 'Missed',
	},
	upcoming: {
		card: 'border-gray-200 bg-white',
		badge: 'bg-gray-200 text-gray-700',
		label: 'Later',
	},
};

const EMPTY_FORM = {
	mealSlot: '' as MealSlot | '',
	carbsGrams: '',
	foodDescription: '',
	notes: '',
};

function formatDate(isoDate: string) {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	});
}

function formatTime(iso: string) {
	return new Date(iso).toLocaleTimeString(undefined, {
		hour: 'numeric',
		minute: '2-digit',
	});
}

export default function CarbLogWorkspace({residentId, residentName}: Props) {
	const [entries, setEntries] = useState<CarbLogEntry[]>([]);
	const [today, setToday] = useState<DayStatus | null>(null);
	const [loading, setLoading] = useState(true);
	const [loadError, setLoadError] = useState<string | null>(null);
	const [form, setForm] = useState(EMPTY_FORM);
	const [saving, setSaving] = useState(false);
	const [editing, setEditing] = useState<CarbLogEntry | null>(null);
	const [printing, setPrinting] = useState(false);

	const load = useCallback(async () => {
		try {
			const res = await fetch(`/api/care/carb-logs?residentId=${residentId}`);
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error || 'Failed to load carb log');
			}
			const data = await res.json();
			setEntries(data.entries || []);
			setToday(data.today || null);
			setLoadError(null);
		} catch (error) {
			setLoadError(error instanceof Error ? error.message : 'Failed to load carb log');
		} finally {
			setLoading(false);
		}
	}, [residentId]);

	useEffect(() => {
		load();
	}, [load]);

	const todayEntries = useMemo(
		() => entries.filter((e) => e.operationalDate === today?.operationalDate),
		[entries, today]
	);

	const loggedMainMeals = useMemo(
		() => new Set(todayEntries.map((e) => e.mealSlot)),
		[todayEntries]
	);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!form.mealSlot) {
			toast.error('Choose a meal');
			return;
		}
		const carbs = Number(form.carbsGrams);
		if (!Number.isInteger(carbs) || carbs < CARBS_GRAMS_MIN || carbs > CARBS_GRAMS_MAX) {
			toast.error(`Carbs must be a whole number between ${CARBS_GRAMS_MIN} and ${CARBS_GRAMS_MAX}g`);
			return;
		}

		setSaving(true);
		try {
			const res = await fetch('/api/care/carb-logs', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					residentId,
					mealSlot: form.mealSlot,
					carbsGrams: carbs,
					foodDescription: form.foodDescription,
					notes: form.notes,
				}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || 'Failed to save');
			toast.success(`${MEAL_SLOT_LABELS[form.mealSlot]} logged`);
			setForm(EMPTY_FORM);
			await load();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to save');
		} finally {
			setSaving(false);
		}
	};

	const handleEditSave = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editing) return;
		const carbs = Number(editing.carbsGrams);
		if (!Number.isInteger(carbs) || carbs < CARBS_GRAMS_MIN || carbs > CARBS_GRAMS_MAX) {
			toast.error(`Carbs must be a whole number between ${CARBS_GRAMS_MIN} and ${CARBS_GRAMS_MAX}g`);
			return;
		}
		setSaving(true);
		try {
			const res = await fetch(`/api/care/carb-logs/${editing.id}`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					carbsGrams: carbs,
					foodDescription: editing.foodDescription ?? '',
					notes: editing.notes ?? '',
				}),
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
		if (!today) return;
		setPrinting(true);
		try {
			// Sheet covers the calendar month of today's operational date.
			const [y, m] = today.operationalDate.split('-').map(Number);
			const from = `${y}-${String(m).padStart(2, '0')}-01`;
			const lastDay = new Date(y, m, 0).getDate();
			const to = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
			const res = await fetch(
				`/api/care/carb-logs?residentId=${residentId}&from=${from}&to=${to}`
			);
			if (!res.ok) throw new Error('Failed to load month');
			const data = await res.json();
			await printCarbLogSheet({
				residentName,
				monthLabel: new Date(y, m - 1, 1).toLocaleDateString(undefined, {
					month: 'long',
					year: 'numeric',
				}),
				from,
				to,
				entries: data.entries || [],
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to print');
		} finally {
			setPrinting(false);
		}
	};

	if (loading) {
		return <div className="p-6 text-gray-500">Loading carb log…</div>;
	}
	if (loadError) {
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

	return (
		<div className="space-y-6">
			{/* Today */}
			<section>
				<div className="flex items-center justify-between mb-3">
					<h3 className="text-lg font-semibold text-gray-900">
						Today · {today ? formatDate(today.operationalDate) : ''}
					</h3>
					<button
						type="button"
						onClick={handlePrint}
						disabled={printing}
						className="px-3 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
						{printing ? 'Preparing…' : '🖨 Print month'}
					</button>
				</div>
				<div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
					{today?.slots.map(({slot, status}) => {
						const style = STATUS_STYLES[status];
						const entry = todayEntries.find((e) => e.mealSlot === slot.key);
						return (
							<div
								key={slot.key}
								className={`rounded-lg border p-3 ${style.card}`}>
								<div className="flex items-center justify-between">
									<span className="font-medium text-gray-900">{slot.label}</span>
									<span className={`text-xs px-2 py-0.5 rounded-full ${style.badge}`}>
										{style.label}
									</span>
								</div>
								<p className="text-xs text-gray-500 mt-0.5">
									{slot.from}–{slot.to}
								</p>
								{entry ? (
									<p className="mt-2 text-sm text-gray-800">
										<span className="text-xl font-semibold">{entry.carbsGrams}g</span>
										{entry.foodDescription && (
											<span className="block text-gray-600 truncate">
												{entry.foodDescription}
											</span>
										)}
									</p>
								) : (
									<button
										type="button"
										onClick={() =>
											setForm((f) => ({...f, mealSlot: slot.key as MealSlot}))
										}
										className="mt-2 text-sm text-blue-700 hover:underline">
										Log {slot.label.toLowerCase()} →
									</button>
								)}
							</div>
						);
					})}
				</div>
			</section>

			{/* Entry form */}
			<form
				onSubmit={handleSubmit}
				className="bg-white rounded-lg border p-4 space-y-4">
				<h4 className="font-semibold text-gray-900">Log a meal</h4>
				<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
					<div>
						<label htmlFor="carb-meal" className="block text-sm font-medium mb-1">
							Meal
						</label>
						<select
							id="carb-meal"
							value={form.mealSlot}
							onChange={(e) =>
								setForm((f) => ({...f, mealSlot: e.target.value as MealSlot | ''}))
							}
							required
							className="w-full border rounded px-3 py-2 min-h-[44px]">
							<option value="">Select…</option>
							{MEAL_SLOTS.map((slot) => (
								<option
									key={slot}
									value={slot}
									disabled={slot !== 'snack' && loggedMainMeals.has(slot)}>
									{MEAL_SLOT_LABELS[slot]}
									{slot !== 'snack' && loggedMainMeals.has(slot) ? ' (logged)' : ''}
								</option>
							))}
						</select>
					</div>
					<div>
						<label htmlFor="carb-grams" className="block text-sm font-medium mb-1">
							Carbohydrates (grams)
						</label>
						<input
							id="carb-grams"
							type="number"
							inputMode="numeric"
							min={CARBS_GRAMS_MIN}
							max={CARBS_GRAMS_MAX}
							step={1}
							value={form.carbsGrams}
							onChange={(e) => setForm((f) => ({...f, carbsGrams: e.target.value}))}
							required
							className="w-full border rounded px-3 py-2 min-h-[44px]"
						/>
					</div>
				</div>
				<div>
					<label htmlFor="carb-food" className="block text-sm font-medium mb-1">
						What was eaten
					</label>
					<input
						id="carb-food"
						type="text"
						value={form.foodDescription}
						onChange={(e) => setForm((f) => ({...f, foodDescription: e.target.value}))}
						placeholder="e.g. 2 slices toast, banana, orange juice"
						className="w-full border rounded px-3 py-2 min-h-[44px]"
					/>
				</div>
				<div>
					<label htmlFor="carb-notes" className="block text-sm font-medium mb-1">
						Notes <span className="text-gray-400 font-normal">(optional)</span>
					</label>
					<textarea
						id="carb-notes"
						value={form.notes}
						onChange={(e) => setForm((f) => ({...f, notes: e.target.value}))}
						rows={2}
						className="w-full border rounded px-3 py-2"
					/>
				</div>
				<div className="flex justify-end">
					<button
						type="submit"
						disabled={saving}
						className="px-5 py-2 min-h-[44px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
						{saving ? 'Saving…' : 'Save entry'}
					</button>
				</div>
			</form>

			{/* History */}
			<section>
				<h4 className="font-semibold text-gray-900 mb-2">Last 14 days</h4>
				{entries.length === 0 ? (
					<p className="text-sm text-gray-500">No entries yet.</p>
				) : (
					<div className="overflow-x-auto rounded-lg border">
						<table className="min-w-full text-sm">
							<thead className="bg-gray-50 text-left text-gray-600">
								<tr>
									<th className="px-3 py-2 font-medium">Date</th>
									<th className="px-3 py-2 font-medium">Meal</th>
									<th className="px-3 py-2 font-medium text-right">Carbs</th>
									<th className="px-3 py-2 font-medium">Food</th>
									<th className="px-3 py-2 font-medium">Logged by</th>
									<th className="px-3 py-2"></th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{entries.map((entry) => (
									<tr key={entry.id}>
										<td className="px-3 py-2 whitespace-nowrap">
											{formatDate(entry.operationalDate)}
										</td>
										<td className="px-3 py-2">{MEAL_SLOT_LABELS[entry.mealSlot]}</td>
										<td className="px-3 py-2 text-right font-medium">
											{entry.carbsGrams}g
										</td>
										<td className="px-3 py-2 text-gray-700">
											{entry.foodDescription || '—'}
											{entry.notes && (
												<span className="block text-xs text-gray-500">{entry.notes}</span>
											)}
										</td>
										<td className="px-3 py-2 text-gray-600 whitespace-nowrap">
											{entry.staffNameSnapshot}
											<span className="block text-xs text-gray-400">
												{formatTime(entry.loggedAt)}
												{entry.updatedAt ? ' · edited' : ''}
											</span>
										</td>
										<td className="px-3 py-2 text-right">
											<button
												type="button"
												onClick={() => setEditing(entry)}
												className="text-blue-700 hover:underline">
												Edit
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</section>

			{/* Edit dialog */}
			{editing && (
				<div
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
					role="dialog"
					aria-modal="true"
					aria-labelledby="carb-edit-title">
					<form
						onSubmit={handleEditSave}
						className="bg-white rounded-lg shadow-xl w-full max-w-md p-5 space-y-4">
						<h4 id="carb-edit-title" className="font-semibold text-gray-900">
							Edit {MEAL_SLOT_LABELS[editing.mealSlot]} ·{' '}
							{formatDate(editing.operationalDate)}
						</h4>
						<div>
							<label htmlFor="carb-edit-grams" className="block text-sm font-medium mb-1">
								Carbohydrates (grams)
							</label>
							<input
								id="carb-edit-grams"
								type="number"
								inputMode="numeric"
								min={CARBS_GRAMS_MIN}
								max={CARBS_GRAMS_MAX}
								step={1}
								value={editing.carbsGrams}
								onChange={(e) =>
									setEditing((prev) =>
										prev ? {...prev, carbsGrams: Number(e.target.value)} : prev
									)
								}
								required
								className="w-full border rounded px-3 py-2 min-h-[44px]"
							/>
						</div>
						<div>
							<label htmlFor="carb-edit-food" className="block text-sm font-medium mb-1">
								What was eaten
							</label>
							<input
								id="carb-edit-food"
								type="text"
								value={editing.foodDescription ?? ''}
								onChange={(e) =>
									setEditing((prev) =>
										prev ? {...prev, foodDescription: e.target.value} : prev
									)
								}
								className="w-full border rounded px-3 py-2 min-h-[44px]"
							/>
						</div>
						<div>
							<label htmlFor="carb-edit-notes" className="block text-sm font-medium mb-1">
								Notes
							</label>
							<textarea
								id="carb-edit-notes"
								value={editing.notes ?? ''}
								onChange={(e) =>
									setEditing((prev) => (prev ? {...prev, notes: e.target.value} : prev))
								}
								rows={2}
								className="w-full border rounded px-3 py-2"
							/>
						</div>
						<div className="flex justify-end gap-2">
							<button
								type="button"
								onClick={() => setEditing(null)}
								className="px-4 py-2 min-h-[44px] rounded border border-gray-300 hover:bg-gray-50">
								Cancel
							</button>
							<button
								type="submit"
								disabled={saving}
								className="px-4 py-2 min-h-[44px] bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
								{saving ? 'Saving…' : 'Save'}
							</button>
						</div>
					</form>
				</div>
			)}
		</div>
	);
}
