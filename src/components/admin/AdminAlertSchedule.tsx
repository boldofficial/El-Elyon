'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

interface AppSettings {
	alertWeekday?: number;
	alertHour?: number;
	alertMinute?: number;
}

export default function AdminAlertSchedule() {
	const [config, setConfig] = useState<AppSettings | null>(null);
	const [weekday, setWeekday] = useState<number>(1);
	const [hour, setHour] = useState<number>(9);
	const [minute, setMinute] = useState<number>(0);
	const [saving, setSaving] = useState(false);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		async function fetchConfig() {
			try {
				const res = await fetch('/api/settings/app');
				if (!res.ok) {
					throw new Error(`HTTP error! status: ${res.status}`);
				}
				const data = await res.json();
				setConfig(data);
				setWeekday(data.alertWeekday ?? 1);
				setHour(data.alertHour ?? 9);
				setMinute(data.alertMinute ?? 0);
			} catch (error) {
				console.error('Error fetching app settings:', error);
				toast.error('Failed to load alert schedule.');
			} finally {
				setLoading(false);
			}
		}
		fetchConfig();
	}, []);

	const handleSave = async (e: React.FormEvent) => {
		e.preventDefault();
		setSaving(true);
		try {
			const res = await fetch('/api/admin/compliance/alert-schedule', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({weekday, hour, minute}),
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to update schedule.');
			}

			toast.success('Schedule updated!');
		} catch (e: any) {
			console.error('Error saving schedule:', e);
			toast.error(e.message || 'Failed to update schedule.');
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="bg-white p-4 rounded shadow mb-4 text-center">
				<p className="text-gray-600">Loading schedule...</p>
			</div>
		);
	}

	return (
		<form onSubmit={handleSave} className="bg-white p-4 rounded shadow mb-4">
			<h3 className="font-bold mb-2">Compliance Alert Schedule</h3>
			<div className="flex gap-2 items-center mb-2">
				<label htmlFor="weekday-select">Weekday:</label>
				<select
					id="weekday-select"
					value={weekday}
					onChange={(e) => setWeekday(Number(e.target.value))}
					className="border rounded p-1"
					disabled={saving}
					aria-label="Select weekday for alert"
				>
					{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
						<option key={i} value={i}>
							{d}
						</option>
					))}
				</select>
				<label htmlFor="hour-input">Hour:</label>
				<input
					id="hour-input"
					type="number"
					min={0}
					max={23}
					value={hour}
					onChange={(e) => setHour(Number(e.target.value))}
					className="border rounded p-1 w-16"
					disabled={saving}
					aria-label="Set hour for alert"
				/>
				<label htmlFor="minute-input">Minute:</label>
				<input
					id="minute-input"
					type="number"
					min={0}
					max={59}
					value={minute}
					onChange={(e) => setMinute(Number(e.target.value))}
					className="border rounded p-1 w-16"
					disabled={saving}
					aria-label="Set minute for alert"
				/>
				<button className="button ml-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50" type="submit" disabled={saving}>
					{saving ? 'Saving...' : 'Save'}
				</button>
			</div>
		</form>
	);
}
