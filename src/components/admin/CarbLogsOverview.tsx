'use client';

// src/components/admin/CarbLogsOverview.tsx
//
// Oversight view of the per-meal carbohydrate log for admins and supervisors:
// one row per resident per day, so a blank meal cell reads as a missed meal
// straight down the column. Read-only -- editing stays on the resident's Carb
// Log tab, where the 24h author / supervisor rule lives.

import React, {useCallback, useEffect, useState} from 'react';
import {toast} from 'sonner';
import type {CarbLogDayRow} from '@/lib/carb-log-summary';
import {MEAL_SLOTS, MEAL_SLOT_LABELS} from '@/lib/carb-log';

interface Props {
	/** Jump to a resident's own Carb Log tab, when the host portal supports it. */
	onOpenResident?: (residentId: string) => void;
}

const RANGE_OPTIONS = [
	{value: '14', label: 'Last 14 days'},
	{value: '30', label: 'Last 30 days'},
	{value: '7', label: 'Last 7 days'},
];

function formatDay(isoDate: string) {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(y, m - 1, d).toLocaleDateString(undefined, {
		weekday: 'short',
		month: 'short',
		day: 'numeric',
	});
}

function shiftIso(isoDate: string, days: number) {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export default function CarbLogsOverview({onOpenResident}: Props) {
	const [filterLocation, setFilterLocation] = useState('');
	const [filterResident, setFilterResident] = useState('');
	const [rangeDays, setRangeDays] = useState('14');
	const [rows, setRows] = useState<CarbLogDayRow[]>([]);
	// Filter options come from the widest result we have seen for the current
	// range, so they stay stable while a filter is applied. This keeps the
	// component self-contained: no locations/residents endpoints, which a
	// supervisor who is not clocked in cannot rely on anyway.
	const [options, setOptions] = useState<{
		locations: string[];
		residents: Array<{id: string; name: string; location: string}>;
	}>({locations: [], residents: []});
	const [range, setRange] = useState<{from: string; to: string} | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchRows = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams({scope: 'days'});
			if (filterLocation) params.set('location', filterLocation);
			if (filterResident) params.set('residentId', filterResident);
			// `to` is left to the server (today in the operational timezone);
			// only the window length is a client concern.
			params.set('from', shiftIso(new Date().toISOString().slice(0, 10), -(Number(rangeDays) - 1)));

			const res = await fetch(`/api/care/carb-logs?${params.toString()}`);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || 'Failed to load carb logs');
			const nextRows: CarbLogDayRow[] = data.rows || [];
			setRows(nextRows);
			setRange({from: data.from, to: data.to});
			setError(null);
			if (!filterLocation && !filterResident) {
				setOptions({
					locations: Array.from(
						new Set(nextRows.map((row) => row.location))
					).sort(),
					residents: Array.from(
						new Map(
							nextRows.map((row) => [
								row.residentId,
								{
									id: row.residentId,
									name: row.residentName,
									location: row.location,
								},
							])
						).values()
					).sort((a, b) => a.name.localeCompare(b.name)),
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load carb logs';
			setError(message);
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}, [filterLocation, filterResident, rangeDays]);

	useEffect(() => {
		fetchRows();
	}, [fetchRows]);

	const trackedResidents = options.residents.filter(
		(r) => !filterLocation || r.location === filterLocation
	);

	return (
		<div className="space-y-4">
			{/* Filters */}
			<div className="bg-white p-4 rounded-lg shadow-sm border grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
				<div>
					<label
						htmlFor="carb-filter-location"
						className="block text-sm font-medium text-gray-700 mb-1">
						Location
					</label>
					<select
						id="carb-filter-location"
						className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
						value={filterLocation}
						onChange={(e) => {
							setFilterLocation(e.target.value);
							setFilterResident('');
						}}>
						<option value="">All Locations</option>
						{options.locations.map((name) => (
							<option key={name} value={name}>
								{name}
							</option>
						))}
					</select>
				</div>

				<div>
					<label
						htmlFor="carb-filter-resident"
						className="block text-sm font-medium text-gray-700 mb-1">
						Resident
					</label>
					<select
						id="carb-filter-resident"
						className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
						value={filterResident}
						onChange={(e) => setFilterResident(e.target.value)}>
						<option value="">All Residents</option>
						{trackedResidents.map((res) => (
							<option key={res.id} value={res.id}>
								{res.name}
							</option>
						))}
					</select>
				</div>

				<div>
					<label
						htmlFor="carb-filter-range"
						className="block text-sm font-medium text-gray-700 mb-1">
						Range
					</label>
					<select
						id="carb-filter-range"
						className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
						value={rangeDays}
						onChange={(e) => setRangeDays(e.target.value)}>
						{RANGE_OPTIONS.map((opt) => (
							<option key={opt.value} value={opt.value}>
								{opt.label}
							</option>
						))}
					</select>
				</div>

				<div>
					<button
						type="button"
						onClick={fetchRows}
						className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium border transition-colors">
						Refresh Data
					</button>
				</div>
			</div>

			{/* Table */}
			<div className="bg-white rounded-lg shadow-sm border overflow-hidden min-h-[300px]">
				{loading ? (
					<div className="flex flex-col items-center justify-center p-12">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
						<p className="text-gray-500">Loading carb logs...</p>
					</div>
				) : error ? (
					<div className="p-8 text-center text-red-700">{error}</div>
				) : rows.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						<p className="font-medium">No carb entries in this range.</p>
						<p className="text-sm mt-1">
							Carb logging is switched on per resident from their profile
							(Care Tracking).
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full text-sm">
							<thead className="bg-gray-50 text-left text-gray-600">
								<tr>
									<th className="px-3 py-2 font-medium">Date</th>
									<th className="px-3 py-2 font-medium">Resident</th>
									<th className="px-3 py-2 font-medium">Location</th>
									{MEAL_SLOTS.map((slot) => (
										<th key={slot} className="px-3 py-2 font-medium text-center">
											{MEAL_SLOT_LABELS[slot]}
										</th>
									))}
									<th className="px-3 py-2 font-medium text-center">Total</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{rows.map((row) => (
									<tr
										key={`${row.operationalDate}-${row.residentId}`}
										className={row.missingMainMeals.length > 0 ? 'bg-red-50/40' : ''}>
										<td className="px-3 py-2 whitespace-nowrap text-gray-700">
											{formatDay(row.operationalDate)}
										</td>
										<td className="px-3 py-2 font-medium text-gray-900">
											{onOpenResident ? (
												<button
													type="button"
													onClick={() => onOpenResident(row.residentId)}
													className="text-blue-700 hover:underline">
													{row.residentName}
												</button>
											) : (
												row.residentName
											)}
										</td>
										<td className="px-3 py-2 text-gray-600">{row.location}</td>
										{MEAL_SLOTS.map((slot) => {
											const cell = row.meals[slot];
											const isMissingMain = row.missingMainMeals.includes(slot);
											return (
												<td
													key={slot}
													className={`px-3 py-2 text-center ${
														isMissingMain ? 'text-red-600' : 'text-gray-900'
													}`}>
													{cell ? (
														<>
															{cell.grams}g
															{cell.count > 1 && (
																<span className="text-xs text-gray-400"> ×{cell.count}</span>
															)}
														</>
													) : isMissingMain ? (
														<span title="Not logged">—</span>
													) : (
														<span className="text-gray-300">—</span>
													)}
												</td>
											);
										})}
										<td className="px-3 py-2 text-center font-semibold text-gray-900">
											{row.totalGrams}g
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{range && !loading && !error && (
				<p className="text-xs text-gray-500">
					Showing {range.from} to {range.to}. Rows shaded red are missing at least
					one main meal; a dash in Breakfast, Lunch or Dinner means nothing was
					logged for that meal.
				</p>
			)}
		</div>
	);
}
