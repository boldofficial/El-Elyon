'use client';

// src/components/admin/BloodGlucoseOverview.tsx
//
// Oversight view of the blood sugar log for admins and supervisors: every
// check across their locations, newest first, with a filter for readings
// that need attention or still need a supervisor's review. Reviewing happens
// here; editing stays on the resident's Blood Sugar tab.

import React, {useCallback, useEffect, useState} from 'react';
import {toast} from 'sonner';
import {CHECK_TYPE_LABELS, formatGlucoseReading, isCritical} from '@/lib/blood-glucose';
import {
	EntryDetails,
	ReviewDialog,
	StatusChip,
	type GlucoseLogEntry,
} from '../care/GlucoseLogWorkspace';
import {formatClock, formatDateTime, formatDay} from '../care/glucosePresentation';

const RANGE_OPTIONS = [
	{value: '7', label: 'Last 7 days'},
	{value: '14', label: 'Last 14 days'},
	{value: '30', label: 'Last 30 days'},
];

const SHOW_OPTIONS = [
	{value: 'unreviewed', label: 'Critical, not reviewed'},
	{value: 'attention', label: 'Critical or refused'},
	{value: 'all', label: 'All checks'},
];

function shiftIso(isoDate: string, days: number) {
	const [y, m, d] = isoDate.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export default function BloodGlucoseOverview() {
	const [filterLocation, setFilterLocation] = useState('');
	const [filterResident, setFilterResident] = useState('');
	const [rangeDays, setRangeDays] = useState('7');
	const [show, setShow] = useState('unreviewed');
	const [entries, setEntries] = useState<GlucoseLogEntry[]>([]);
	const [canReview, setCanReview] = useState(false);
	const [truncated, setTruncated] = useState(false);
	// Filter options come from the widest result seen, like CarbLogsOverview.
	const [options, setOptions] = useState<{
		locations: string[];
		residents: Array<{id: string; name: string; location: string}>;
	}>({locations: [], residents: []});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [reviewing, setReviewing] = useState<GlucoseLogEntry | null>(null);

	const fetchEntries = useCallback(async () => {
		setLoading(true);
		try {
			const params = new URLSearchParams({scope: 'list', show});
			if (filterLocation) params.set('location', filterLocation);
			if (filterResident) params.set('residentId', filterResident);
			params.set(
				'from',
				shiftIso(new Date().toISOString().slice(0, 10), -(Number(rangeDays) - 1))
			);
			const res = await fetch(`/api/care/blood-glucose-logs?${params.toString()}`);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || 'Failed to load blood sugar checks');
			const next: GlucoseLogEntry[] = data.entries || [];
			setEntries(next);
			setCanReview(!!data.canReview);
			setTruncated(!!data.truncated);
			setError(null);
			if (!filterLocation && !filterResident) {
				setOptions((prev) => {
					const residents = new Map(prev.residents.map((r) => [r.id, r]));
					for (const e of next) {
						residents.set(e.residentId, {
							id: e.residentId,
							name: e.residentName ?? '',
							location: e.location,
						});
					}
					return {
						locations: Array.from(
							new Set([...prev.locations, ...next.map((e) => e.location)])
						).sort(),
						residents: Array.from(residents.values()).sort((a, b) =>
							a.name.localeCompare(b.name)
						),
					};
				});
			}
		} catch (err) {
			const message = err instanceof Error ? err.message : 'Failed to load blood sugar checks';
			setError(message);
			toast.error(message);
		} finally {
			setLoading(false);
		}
	}, [filterLocation, filterResident, rangeDays, show]);

	useEffect(() => {
		fetchEntries();
	}, [fetchEntries]);

	const residentOptions = options.residents.filter(
		(r) => !filterLocation || r.location === filterLocation
	);
	const selectClass =
		'w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';

	return (
		<div className="space-y-4">
			<div className="bg-white p-4 rounded-lg shadow-sm border grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
				<div>
					<label htmlFor="bg-filter-show" className="block text-sm font-medium text-gray-700 mb-1">
						Show
					</label>
					<select
						id="bg-filter-show"
						className={selectClass}
						value={show}
						onChange={(e) => setShow(e.target.value)}>
						{SHOW_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</div>
				<div>
					<label htmlFor="bg-filter-location" className="block text-sm font-medium text-gray-700 mb-1">
						Location
					</label>
					<select
						id="bg-filter-location"
						className={selectClass}
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
					<label htmlFor="bg-filter-resident" className="block text-sm font-medium text-gray-700 mb-1">
						Resident
					</label>
					<select
						id="bg-filter-resident"
						className={selectClass}
						value={filterResident}
						onChange={(e) => setFilterResident(e.target.value)}>
						<option value="">All Residents</option>
						{residentOptions.map((r) => (
							<option key={r.id} value={r.id}>
								{r.name}
							</option>
						))}
					</select>
				</div>
				<div>
					<label htmlFor="bg-filter-range" className="block text-sm font-medium text-gray-700 mb-1">
						Range
					</label>
					<select
						id="bg-filter-range"
						className={selectClass}
						value={rangeDays}
						onChange={(e) => setRangeDays(e.target.value)}>
						{RANGE_OPTIONS.map((o) => (
							<option key={o.value} value={o.value}>
								{o.label}
							</option>
						))}
					</select>
				</div>
				<div>
					<button
						type="button"
						onClick={fetchEntries}
						className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium border transition-colors">
						Refresh Data
					</button>
				</div>
			</div>

			<div className="bg-white rounded-lg shadow-sm border overflow-hidden min-h-[300px]">
				{loading ? (
					<div className="flex flex-col items-center justify-center p-12">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
						<p className="text-gray-500">Loading blood sugar checks...</p>
					</div>
				) : error ? (
					<div className="p-8 text-center text-red-700">{error}</div>
				) : entries.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						<p className="font-medium">
							{show === 'unreviewed'
								? 'Nothing waiting for review in this range.'
								: 'No blood sugar checks in this range.'}
						</p>
						<p className="text-sm mt-1">
							Blood sugar logging is switched on per resident from their profile (Care
							Tracking).
						</p>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full text-sm">
							<thead className="bg-gray-50 text-left text-gray-600">
								<tr>
									<th className="px-3 py-2 font-medium">When</th>
									<th className="px-3 py-2 font-medium">Resident</th>
									<th className="px-3 py-2 font-medium">Check</th>
									<th className="px-3 py-2 font-medium">Reading</th>
									<th className="px-3 py-2 font-medium">Details</th>
									<th className="px-3 py-2 font-medium">Logged by</th>
									<th className="px-3 py-2 font-medium">Review</th>
								</tr>
							</thead>
							<tbody className="divide-y">
								{entries.map((entry) => (
									<tr key={entry.id} className={isCritical(entry.status) ? 'bg-red-50/40' : ''}>
										<td className="px-3 py-2 whitespace-nowrap text-gray-700">
											{formatDay(entry.operationalDate)}
											<span className="block text-xs text-gray-500">
												{formatClock(entry.checkedAt)}
											</span>
										</td>
										<td className="px-3 py-2">
											<span className="font-medium text-gray-900">{entry.residentName}</span>
											<span className="block text-xs text-gray-500">{entry.location}</span>
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
											{entry.updatedAt && <span className="block text-xs text-gray-400">edited</span>}
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
											) : canReview ? (
												<button
													type="button"
													onClick={() => setReviewing(entry)}
													className="px-3 py-1.5 rounded border border-blue-600 text-blue-700 hover:bg-blue-50 text-sm">
													Review
												</button>
											) : (
												<span className="text-gray-400">Not yet</span>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				)}
			</div>

			{!loading && !error && truncated && (
				<p className="text-xs text-amber-800">
					Showing the newest 500 checks. Narrow the range or pick a resident to see the rest.
				</p>
			)}

			{reviewing && (
				<ReviewDialog
					entry={reviewing}
					onClose={() => setReviewing(null)}
					onReviewed={() => {
						setReviewing(null);
						fetchEntries();
					}}
				/>
			)}
		</div>
	);
}
