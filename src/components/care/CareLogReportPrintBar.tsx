'use client';

// src/components/care/CareLogReportPrintBar.tsx
//
// Date-range picker + "Print / Save as PDF" button for the activity-log
// report. Admins pick a location; the inspector dashboard omits `locations`
// because the inspector's session already fixes it server-side.

import React, {useState} from 'react';
import {toast} from 'sonner';
import type {CareLogReport} from '@/lib/care-log-report';
import {printCareLogReport} from './printCareLogReport';

interface Props {
	endpoint: string;
	/** When given, the user must choose one; its id is sent as `locationId`. */
	locations?: Array<{id: string; name: string}>;
}

function localIsoDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	return `${y}-${m}-${d}`;
}

export default function CareLogReportPrintBar({endpoint, locations}: Props) {
	const today = new Date();
	const [locationId, setLocationId] = useState('');
	const [from, setFrom] = useState(() =>
		localIsoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29))
	);
	const [to, setTo] = useState(() => localIsoDate(today));
	const [busy, setBusy] = useState(false);

	const needsLocation = locations !== undefined;

	const handlePrint = async () => {
		if (needsLocation && !locationId) {
			toast.error('Choose a location');
			return;
		}
		setBusy(true);
		try {
			const params = new URLSearchParams({from, to});
			if (needsLocation) params.set('locationId', locationId);
			const res = await fetch(`${endpoint}?${params.toString()}`);
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error || 'Failed to build the report');

			const report = data as CareLogReport;
			if (report.entries.length === 0) {
				toast.info('No activity logs in this range. The report will say so.');
			}
			const started = await printCareLogReport(report);
			if (!started) toast.error('Another print is already open');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to build the report');
		} finally {
			setBusy(false);
		}
	};

	const inputClass =
		'w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500';

	return (
		<div className="bg-white p-4 rounded-lg shadow-sm border">
			<div className="mb-3">
				<h3 className="text-sm font-semibold text-gray-800">Activity log report</h3>
				<p className="text-xs text-gray-500">
					Every log for {needsLocation ? 'one location' : 'this location'} in a date
					range, ready to print or save as a PDF for inspectors. In the print window,
					choose &ldquo;Save as PDF&rdquo; as the destination.
				</p>
			</div>
			<div
				className={`grid grid-cols-1 gap-4 items-end ${
					needsLocation ? 'md:grid-cols-4' : 'md:grid-cols-3'
				}`}>
				{needsLocation && (
					<div>
						<label
							htmlFor="care-log-report-location"
							className="block text-sm font-medium text-gray-700 mb-1">
							Location
						</label>
						<select
							id="care-log-report-location"
							className={inputClass}
							value={locationId}
							onChange={(e) => setLocationId(e.target.value)}>
							<option value="">Choose a location...</option>
							{locations.map((loc) => (
								<option key={loc.id} value={loc.id}>
									{loc.name}
								</option>
							))}
						</select>
					</div>
				)}
				<div>
					<label
						htmlFor="care-log-report-from"
						className="block text-sm font-medium text-gray-700 mb-1">
						From
					</label>
					<input
						id="care-log-report-from"
						type="date"
						className={inputClass}
						value={from}
						max={to}
						onChange={(e) => setFrom(e.target.value)}
					/>
				</div>
				<div>
					<label
						htmlFor="care-log-report-to"
						className="block text-sm font-medium text-gray-700 mb-1">
						To
					</label>
					<input
						id="care-log-report-to"
						type="date"
						className={inputClass}
						value={to}
						min={from}
						onChange={(e) => setTo(e.target.value)}
					/>
				</div>
				<div>
					<button
						type="button"
						onClick={handlePrint}
						disabled={busy}
						className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-60 text-sm font-medium transition-colors">
						{busy ? 'Preparing…' : 'Print / Save as PDF'}
					</button>
				</div>
			</div>
		</div>
	);
}
