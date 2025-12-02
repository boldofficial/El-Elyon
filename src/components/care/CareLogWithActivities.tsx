// src/components/care/CareLogWithActivities.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

interface ResidentLogActivity {
	id: string;
	logId: string;
	activityType: string;
	completed: boolean;
	notes: string | null;
	timestamp: string;
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
	'Took Meds',
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

	useEffect(() => {
		async function fetchLogAndActivities() {
			setLoading(true);
			try {
				// Fetch latest log for this resident, or create a default one
				// For simplicity, we'll try to fetch, if none, we'll assume a new one
				// In a real app, you might have a "today's log" concept
				const logsRes = await fetch(`/api/care/resident-logs?residentId=${residentId}`);
				if (!logsRes.ok) throw new Error('Failed to fetch resident logs');
				const logs: ResidentLog[] = await logsRes.json();

				let latestLog: ResidentLog | undefined;
				if (logs.length > 0) {
					// Assuming the API returns logs sorted by creation, take the first one (most recent)
					latestLog = logs[0];
				}

				if (latestLog) {
					setCurrentLog(latestLog);
					setGeneralNotes(latestLog.content || '');

					const activitiesRes = await fetch(
						`/api/care/resident-logs/${latestLog.id}/activities`
					);
					if (!activitiesRes.ok)
						throw new Error('Failed to fetch log activities');
					const fetchedActivities: ResidentLogActivity[] =
						await activitiesRes.json();

					// Merge fetched activities with common activities
					const initialActivities: ActivityState[] = COMMON_ACTIVITIES.map(
						(name) => {
							const existing = fetchedActivities.find(
								(a) => a.activityType === name
							);
							return {
								id: existing?.id,
								activityType: name,
								completed: existing?.completed || false,
								notes: existing?.notes || '',
							};
						}
					);
					// Add any custom activities that are not in COMMON_ACTIVITIES
					fetchedActivities.forEach((fa) => {
						if (!COMMON_ACTIVITIES.includes(fa.activityType)) {
							initialActivities.push({
								id: fa.id,
								activityType: fa.activityType,
								completed: fa.completed,
								notes: fa.notes || '',
							});
						}
					});
					setActivities(initialActivities);
				} else {
					// Initialize with common activities if no log found
					setActivities(
						COMMON_ACTIVITIES.map((name) => ({
							activityType: name,
							completed: false,
							notes: '',
							isNew: true, // Mark as new for initial post
						}))
					);
					setGeneralNotes('');
					setCurrentLog(null);
				}
			} catch (error) {
				console.error('Error fetching log and activities:', error);
				toast.error('Failed to load resident activities');
				// Fallback to initial common activities on error
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
			} finally {
				setLoading(false);
			}
		}

		fetchLogAndActivities();
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
		setSubmitting(true);

		try {
			let logIdToUse = currentLog?.id;

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
					}),
				});
				if (!logRes.ok) throw new Error('Failed to create resident log');
				const newLogId = await logRes.json();
				logIdToUse = newLogId;
				setCurrentLog((prev) => (prev ? {...prev, id: newLogId} : {id: newLogId, residentId, content: generalNotes, createdAt: new Date().toISOString()}));
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
				if (!logRes.ok) throw new Error('Failed to update resident log');
				setCurrentLog((prev) => (prev ? {...prev, content: generalNotes} : null));
			}

			if (!logIdToUse) {
				throw new Error('Could not determine log ID');
			}

			// 2. Process activities
			for (const activity of activities) {
				if (!activity.activityType) continue; // Skip empty activity names

				if (activity.id) {
					// Existing activity: Update or delete
					await fetch(`/api/care/resident-logs/${logIdToUse}/activities`, {
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
						`/api/care/resident-logs/${logIdToUse}/activities`,
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
					if (!activityRes.ok) throw new Error('Failed to create activity');
					// Update the activity with the new ID from the backend
					const newActivity = await activityRes.json();
					setActivities((prev) =>
						prev.map((a) => (a === activity ? {...a, id: newActivity.id} : a))
					);
				}
			}

			toast.success('Activity log saved successfully');
			// Refresh activities to ensure all IDs are updated and state is consistent
			if (onSuccess) onSuccess();
		} catch (error) {
			console.error('Error saving log:', error);
			toast.error('Failed to save activity log');
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

			<form onSubmit={handleSubmit} className="space-y-6">
				{/* Common Activities */}
				<div>
					<h3 className="text-lg font-semibold mb-3">Common Activities</h3>
					<div className="space-y-3">
						{activities.map((activity, index) => (
							<div key={activity.id || index} className="border rounded-lg p-4">
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
									{!COMMON_ACTIVITIES.includes(activity.activityType) && (
										<button
											type="button"
											onClick={() => handleRemoveActivity(index)}
											className="text-red-600 hover:text-red-800 text-sm">
											Remove
										</button>
									)}
								</div>
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
