// src/components/care/CareLogWithActivities.tsx

'use client';

import React, {useState} from 'react';
import {toast} from 'sonner';

interface Activity {
	id?: string;
	activityType: string;
	completed: boolean;
	notes?: string;
}

interface CareLogWithActivitiesProps {
	residentId: string;
	residentName: string;
	location: string;
	shiftId?: string;
	authorName: string;
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
	authorName,
	onSuccess,
}: CareLogWithActivitiesProps) {
	const [activities, setActivities] = useState<Activity[]>(
		COMMON_ACTIVITIES.map((name) => ({
			activityType: name,
			completed: false,
			notes: '',
		}))
	);
	const [generalNotes, setGeneralNotes] = useState('');
	const [submitting, setSubmitting] = useState(false);

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
			{activityType: '', completed: false, notes: ''},
		]);
	};

	const handleRemoveActivity = (index: number) => {
		setActivities(activities.filter((_, i) => i !== index));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);

		try {
			const res = await fetch(`/api/care/residents/${residentId}/logs`, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					logType: 'daily_activities',
					content: generalNotes,
					location,
					shiftId,
					authorName,
					activities: activities.filter((a) => a.activityType), // Only include activities with names
				}),
			});

			if (!res.ok) throw new Error('Failed to create log');

			toast.success('Activity log saved successfully');

			// Reset form
			setActivities(
				COMMON_ACTIVITIES.map((name) => ({
					activityType: name,
					completed: false,
					notes: '',
				}))
			);
			setGeneralNotes('');

			if (onSuccess) onSuccess();
		} catch (error) {
			console.error('Error saving log:', error);
			toast.error('Failed to save activity log');
		} finally {
			setSubmitting(false);
		}
	};

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
							<div key={index} className="border rounded-lg p-4">
								<div className="flex items-start gap-3">
									<input
										type="checkbox"
										checked={activity.completed}
										onChange={() => handleToggleActivity(index)}
										className="mt-1 h-5 w-5 rounded border-gray-300"
									/>
									<div className="flex-1">
										{index >= COMMON_ACTIVITIES.length ? (
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
										) : (
											<label className="font-medium text-gray-900 cursor-pointer">
												{activity.activityType}
											</label>
										)}
										<textarea
											value={activity.notes || ''}
											onChange={(e) => handleNotesChange(index, e.target.value)}
											placeholder="Add notes (optional)"
											rows={2}
											className="w-full border rounded px-3 py-2 text-sm mt-2"
										/>
									</div>
									{index >= COMMON_ACTIVITIES.length && (
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
							setActivities(
								COMMON_ACTIVITIES.map((name) => ({
									activityType: name,
									completed: false,
									notes: '',
								}))
							);
							setGeneralNotes('');
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
