// src/components/care/CareLogWithActivities.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';
import {
	LATE_ENTRY_MAX_DAYS,
	LATE_ENTRY_REASON_MAX_LENGTH,
	shiftDate,
} from '@/lib/care-log-policy';

// The browser's local date; only bounds the date picker. The server checks
// the chosen day against the organization's timezone.
function localToday(): string {
	const now = new Date();
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface ActivityState {
	id?: string; // For existing activities
	activityType: string;
	completed: boolean;
	notes?: string;
	isNew?: boolean; // To distinguish between common and custom new activities
}

interface ResidentLog {
	id: string;
	residentId: string;
	content: string;
	createdAt: string;
	template?: string; // Add template field
	// other fields you might fetch
}

interface CareLogWithActivitiesProps {
	residentId: string;
	residentName: string;
	location: string;
	shiftId?: string;
	// authorName: string; // Removed as it's derived from clerkUserId in API
	onSuccess?: () => void;
}

const COMMON_ACTIVITIES = [
	'7 AM Meds',
	'8 AM Meds',
	'2 PM Meds',
	'5 PM Meds',
	'8 PM Meds',
	'PRN Meds',
	'Breakfast',
	'Lunch',
	'Dinner',
	'Bath/Shower',
	'Exercise',
	'Social Activity',
	'Medical Appointment',
];

export default function CareLogWithActivities({
	residentId,
	residentName,
	location,
	shiftId,
	// authorName, // Removed
	onSuccess,
}: CareLogWithActivitiesProps) {
	const [activities, setActivities] = useState<ActivityState[]>([]);
	const [generalNotes, setGeneralNotes] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [currentLog, setCurrentLog] = useState<ResidentLog | null>(null);
	const [loading, setLoading] = useState(true);
	const [residentConfirmed, setResidentConfirmed] = useState(false);
	const [isLateEntry, setIsLateEntry] = useState(false);
	const [loggedForDate, setLoggedForDate] = useState('');
	const [lateEntryReason, setLateEntryReason] = useState('');

	const resetLateEntry = () => {
		setIsLateEntry(false);
		setLoggedForDate('');
		setLateEntryReason('');
	};

	const safeErrorMessage = async (res: Response) => {
		try {
			const data = await res.json();
			return data?.error || data?.message;
		} catch (_err) {
			return undefined;
		}
	};

	const toLogId = (value: any): string | undefined => {
		if (!value) return undefined;
		if (typeof value === 'string') return value;
		if (typeof value === 'object' && 'id' in value && typeof value.id === 'string') {
			return value.id;
		}
		return String(value);
	};

	useEffect(() => {
		setResidentConfirmed(false);
		setActivities(
			COMMON_ACTIVITIES.map((name) => ({
				activityType: name,
				completed: false,
				notes: '',
				isNew: true,
			}))
		);
		setGeneralNotes('');
		setCurrentLog(null);
		resetLateEntry();
		setLoading(false);
	}, [residentId]);


	const handleToggleActivity = (index: number) => {
		const updated = [...activities];
		updated[index].completed = !updated[index].completed;
		setActivities(updated);
	};

	const handleNotesChange = (index: number, notes: string) => {
		const updated = [...activities];
		updated[index].notes = notes;
		setActivities(updated);
	};

	const handleAddCustomActivity = () => {
		setActivities([
			...activities,
			{activityType: '', completed: false, notes: '', isNew: true},
		]);
	};

	const handleRemoveActivity = (index: number) => {
		const activityToRemove = activities[index];
		if (activityToRemove.id) {
			// If it's an existing activity, attempt to delete via API
			// This would typically involve a confirmation dialog
			if (window.confirm('Are you sure you want to remove this activity?')) {
				fetch(
					`/api/care/resident-logs/${currentLog?.id}/activities`,
					{
						method: 'DELETE',
						headers: {'Content-Type': 'application/json'},
						body: JSON.stringify({activityId: activityToRemove.id}),
					}
				)
					.then((res) => {
						if (!res.ok) throw new Error('Failed to delete activity');
						toast.success('Activity removed successfully');
						setActivities(activities.filter((_, i) => i !== index));
					})
					.catch((error) => {
						console.error('Error deleting activity:', error);
						toast.error('Failed to remove activity');
					});
			}
		} else {
			// If it's a new, unsaved activity, just remove from state
			setActivities(activities.filter((_, i) => i !== index));
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!activities.some((activity) => activity.completed)) {
			toast.error('Select at least one completed activity');
			return;
		}

		if (!generalNotes.trim()) {
			toast.error('General notes are required');
			return;
		}

		if (!residentConfirmed) {
			toast.error(`Confirm this log is for ${residentName}`);
			return;
		}

		if (isLateEntry && !loggedForDate) {
			toast.error('Choose the day this log is for');
			return;
		}

		setSubmitting(true);

		try {
			let logIdToUse = toLogId(currentLog?.id);

			// 1. Create/Update the main resident log (for general notes)
			if (!logIdToUse) {
				// Create new log if none exists
				const logRes = await fetch(`/api/care/create-log`, {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({
						residentId,
						template: 'daily_activities', // A generic template for this log type
						content: generalNotes,
						location,
						shiftId,
						// authorName, // This should be derived from clerkUserId in API
						...(isLateEntry ? {loggedForDate, lateEntryReason} : {}),
					}),
				});
				if (!logRes.ok) {
					const message = await safeErrorMessage(logRes);
					throw new Error(message || 'Failed to create resident log');
				}
				const newLog = await logRes.json();
				const newLogId = toLogId(newLog);
				if (!newLogId) throw new Error('Invalid log id returned');
				logIdToUse = newLogId;
				setCurrentLog((prev) =>
					prev
						? {...prev, id: newLogId}
						: {
							id: newLogId,
							residentId,
							content: generalNotes,
							createdAt: new Date().toISOString(),
						}
				);
			} else {
				// Update existing log's general notes
				const logRes = await fetch(`/api/care/edit-log`, {
					method: 'PATCH', // Or PUT, depending on API design
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({
						logId: logIdToUse,
						residentId,
						template: 'daily_activities',
						fields: {content: generalNotes}, // Send content as part of fields
						// authorName,
					}),
				});
				if (!logRes.ok) {
					const message = await safeErrorMessage(logRes);
					throw new Error(message || 'Failed to update resident log');
				}
				setCurrentLog((prev) => (prev ? {...prev, content: generalNotes} : null));
			}

			if (!logIdToUse) {
				throw new Error('Could not determine log ID');
			}
			const logIdForActivities = toLogId(logIdToUse);
			if (!logIdForActivities) {
				throw new Error('Invalid log ID for activities');
			}

			// 2. Process activities
			for (const activity of activities) {
				if (!activity.activityType) continue; // Skip empty activity names

				if (activity.id) {
					// Existing activity: Update or delete
					await fetch(`/api/care/resident-logs/${logIdForActivities}/activities`, {
						method: 'PATCH',
						headers: {'Content-Type': 'application/json'},
						body: JSON.stringify({
							activityId: activity.id,
							activityType: activity.activityType,
							completed: activity.completed,
							notes: activity.notes,
						}),
					});
				} else if (activity.isNew || activity.activityType) {
					// New activity: Create
					const activityRes = await fetch(
						`/api/care/resident-logs/${logIdForActivities}/activities`,
						{
							method: 'POST',
							headers: {'Content-Type': 'application/json'},
							body: JSON.stringify({
								logId: logIdToUse,
								activityType: activity.activityType,
								completed: activity.completed,
								notes: activity.notes,
							}),
						}
					);
					if (!activityRes.ok) {
						const message = await safeErrorMessage(activityRes);
						throw new Error(message || 'Failed to create activity');
					}
					// Update the activity with the new ID from the backend
					const newActivity = await activityRes.json();
					setActivities((prev) =>
						prev.map((a) => (a === activity ? {...a, id: newActivity.id} : a))
					);
				}
			}

			toast.success('Activity log saved successfully');
			setActivities(
				COMMON_ACTIVITIES.map((name) => ({
					activityType: name,
					completed: false,
					notes: '',
					isNew: true,
				}))
			);
			setGeneralNotes('');
			setCurrentLog(null);
			setResidentConfirmed(false);
			resetLateEntry();
			// Refresh activities to ensure all IDs are updated and state is consistent
			if (onSuccess) onSuccess();
		} catch (error) {
			console.error('Error saving log:', error);
			toast.error(
				error instanceof Error && error.message
					? error.message
					: 'Failed to save activity log'
			);
		} finally {
			setSubmitting(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		);
	}

	return (
		<div className="bg-white rounded-lg shadow p-6">
			<h2 className="text-xl font-bold mb-4">
				Daily Activity Log - {residentName}
			</h2>
			<div className="mb-6 rounded border border-blue-200 bg-blue-50 px-4 py-3">
				<p className="text-sm font-medium text-blue-950">
					You are documenting care for {residentName}.
				</p>
				<label className="mt-3 flex items-start gap-3 text-sm text-blue-950">
					<input
						type="checkbox"
						checked={residentConfirmed}
						onChange={(e) => setResidentConfirmed(e.target.checked)}
						className="mt-0.5 h-4 w-4 rounded border-blue-300"
					/>
					<span>I confirm this activity log is for {residentName}.</span>
				</label>
			</div>

			<div className="mb-6 rounded border border-amber-200 bg-amber-50 px-4 py-3">
				<label className="flex items-start gap-3 text-sm text-amber-950">
					<input
						type="checkbox"
						checked={isLateEntry}
						onChange={(e) => {
							if (e.target.checked) setIsLateEntry(true);
							else resetLateEntry();
						}}
						className="mt-0.5 h-4 w-4 rounded border-amber-300"
					/>
					<span>
						This log is for an earlier day I forgot to log (up to {LATE_ENTRY_MAX_DAYS} days back).
					</span>
				</label>
				{isLateEntry && (
					<div className="mt-3 space-y-3">
						<div>
							<label htmlFor="logged-for-date" className="block text-sm font-medium text-amber-950">
								Day this log is for *
							</label>
							<input
								id="logged-for-date"
								type="date"
								value={loggedForDate}
								min={shiftDate(localToday(), -LATE_ENTRY_MAX_DAYS)}
								max={shiftDate(localToday(), -1)}
								onChange={(e) => setLoggedForDate(e.target.value)}
								className="mt-1 border rounded px-3 py-2 text-sm"
								required
							/>
						</div>
						<div>
							<label htmlFor="late-entry-reason" className="block text-sm font-medium text-amber-950">
								Reason (optional)
							</label>
							<textarea
								id="late-entry-reason"
								value={lateEntryReason}
								onChange={(e) => setLateEntryReason(e.target.value)}
								maxLength={LATE_ENTRY_REASON_MAX_LENGTH}
								rows={2}
								placeholder="e.g. Forgot to log before clocking out"
								className="mt-1 w-full border rounded px-3 py-2 text-sm"
							/>
						</div>
						<p className="text-xs text-amber-900">
							You must have worked a shift at this house that day. The log will be marked as a late entry and will show today as the day it was entered.
						</p>
					</div>
				)}
			</div>

			<form onSubmit={handleSubmit} className="space-y-6">
				{/* Common Activities */}
				<div>
					<h3 className="text-lg font-semibold mb-3">Common Activities</h3>
					<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{activities.map((activity, index) => (
							<div key={activity.id || index} className="border rounded-lg p-4 h-full flex flex-col gap-3">
								<div className="flex items-start gap-3">
									<input
										type="checkbox"
										checked={activity.completed}
										onChange={() => handleToggleActivity(index)}
										className="mt-1 h-5 w-5 rounded border-gray-300"
									/>
									<div className="flex-1">
										{COMMON_ACTIVITIES.includes(activity.activityType) ? (
											<label className="font-medium text-gray-900 cursor-pointer">
												{activity.activityType}
											</label>
										) : (
											<input
												type="text"
												value={activity.activityType}
												onChange={(e) => {
													const updated = [...activities];
													updated[index].activityType = e.target.value;
													setActivities(updated);
												}}
												placeholder="Activity name"
												className="w-full border rounded px-3 py-1 mb-2"
											/>
										)}
										<textarea
											value={activity.notes || ''}
											onChange={(e) => handleNotesChange(index, e.target.value)}
											placeholder="Add notes (optional)"
											rows={2}
											className="w-full border rounded px-3 py-2 text-sm mt-2"
										/>
									</div>
								</div>
								{!COMMON_ACTIVITIES.includes(activity.activityType) && (
									<div className="flex justify-end">
										<button
											type="button"
											onClick={() => handleRemoveActivity(index)}
											className="text-red-600 hover:text-red-800 text-sm">
											Remove
										</button>
									</div>
								)}
							</div>
						))}
					</div>

					<button
						type="button"
						onClick={handleAddCustomActivity}
						className="mt-3 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded border border-blue-600">
						+ Add Custom Activity
					</button>
				</div>

				{/* General Notes */}
				<div>
					<label className="block text-lg font-semibold mb-2">
						General Notes
					</label>
					<textarea
						value={generalNotes}
						onChange={(e) => setGeneralNotes(e.target.value)}
						rows={4}
						className="w-full border rounded px-3 py-2"
						placeholder="Enter any general observations or notes about the resident..."
					/>
				</div>

				{/* Submit Button */}
				<div className="flex justify-end gap-3">
					<button
						type="button"
						onClick={() => {
							// Reset activities to common ones and clear notes
							setActivities(
								COMMON_ACTIVITIES.map((name) => ({
									activityType: name,
									completed: false,
									notes: '',
									isNew: true, // Mark as new for initial post
								}))
							);
							setGeneralNotes('');
							setCurrentLog(null); // Clear current log as well
							setResidentConfirmed(false);
						}}
						className="px-6 py-2 border rounded hover:bg-gray-50">
						Clear
					</button>
					<button
						type="submit"
						disabled={submitting}
						className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
						{submitting ? 'Saving...' : 'Save Activity Log'}
					</button>
				</div>
			</form>
		</div>
	);
}
