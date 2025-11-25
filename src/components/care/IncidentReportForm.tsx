// src/components/care/IncidentReportForm.tsx

'use client';

import React, {useState} from 'react';
import {toast} from 'sonner';

interface IncidentReportFormProps {
	residentId: string;
	residentName: string;
	location: string;
	onSuccess?: () => void;
	onCancel?: () => void;
}

const INCIDENT_TYPES = [
	'Medical',
	'Behavioral',
	'Safety',
	'Medication Error',
	'Fall',
	'Injury',
	'Property Damage',
	'Missing Person',
	'Other',
];

const SEVERITY_LEVELS = [
	{value: 'low', label: 'Low', color: 'green'},
	{value: 'medium', label: 'Medium', color: 'yellow'},
	{value: 'high', label: 'High', color: 'orange'},
	{value: 'critical', label: 'Critical', color: 'red'},
];

export default function IncidentReportForm({
	residentId,
	residentName,
	location,
	onSuccess,
	onCancel,
}: IncidentReportFormProps) {
	const [submitting, setSubmitting] = useState(false);
	const [formData, setFormData] = useState({
		incidentDate: new Date().toISOString().slice(0, 16), // datetime-local format
		incidentType: 'Other',
		severity: 'medium',
		description: '',
		actionTaken: '',
		witnessNames: '',
		followUpRequired: false,
		followUpNotes: '',
	});

	const handleChange = (
		e: React.ChangeEvent<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>
	) => {
		const {name, value, type} = e.target;

		if (type === 'checkbox') {
			const checked = (e.target as HTMLInputElement).checked;
			setFormData((prev) => ({...prev, [name]: checked}));
		} else {
			setFormData((prev) => ({...prev, [name]: value}));
		}
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!formData.description.trim()) {
			toast.error('Please provide an incident description');
			return;
		}

		setSubmitting(true);

		try {
			const res = await fetch(`/api/care/residents/${residentId}/incidents`, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					...formData,
					location,
				}),
			});

			if (!res.ok) throw new Error('Failed to create incident report');

			toast.success('Incident report submitted successfully');

			if (onSuccess) onSuccess();
		} catch (error) {
			console.error('Error submitting incident report:', error);
			toast.error('Failed to submit incident report');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="bg-white rounded-lg border p-6">
			<h2 className="text-xl font-bold mb-6">
				New Incident Report - {residentName}
			</h2>

			<form onSubmit={handleSubmit} className="space-y-6">
				{/* Incident Date & Time */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Incident Date & Time <span className="text-red-500">*</span>
					</label>
					<input
						type="datetime-local"
						name="incidentDate"
						value={formData.incidentDate}
						onChange={handleChange}
						required
						className="w-full border rounded px-3 py-2"
					/>
				</div>

				{/* Incident Type */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Incident Type <span className="text-red-500">*</span>
					</label>
					<select
            id="incidentType"
            title="Incident Type"
						name="incidentType"
						value={formData.incidentType}
						onChange={handleChange}
						required
						className="w-full border rounded px-3 py-2">
						{INCIDENT_TYPES.map((type) => (
							<option key={type} value={type}>
								{type}
							</option>
						))}
					</select>
				</div>

				{/* Severity */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Severity Level <span className="text-red-500">*</span>
					</label>
					<div className="grid grid-cols-4 gap-2">
						{SEVERITY_LEVELS.map((level) => (
							<label
								key={level.value}
								className={`flex items-center justify-center px-4 py-3 rounded border-2 cursor-pointer transition-all ${
									formData.severity === level.value
										? `border-${level.color}-500 bg-${level.color}-50`
										: 'border-gray-300 bg-white hover:border-gray-400'
								}`}>
								<input
									type="radio"
									name="severity"
									value={level.value}
									checked={formData.severity === level.value}
									onChange={handleChange}
									className="sr-only"
								/>
								<span
									className={`font-medium ${
										formData.severity === level.value
											? `text-${level.color}-800`
											: 'text-gray-700'
									}`}>
									{level.label}
								</span>
							</label>
						))}
					</div>
				</div>

				{/* Description */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Incident Description <span className="text-red-500">*</span>
					</label>
					<textarea
						name="description"
						value={formData.description}
						onChange={handleChange}
						required
						rows={4}
						placeholder="Describe what happened in detail..."
						className="w-full border rounded px-3 py-2"
					/>
				</div>

				{/* Action Taken */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Action Taken
					</label>
					<textarea
						name="actionTaken"
						value={formData.actionTaken}
						onChange={handleChange}
						rows={3}
						placeholder="Describe any immediate actions taken..."
						className="w-full border rounded px-3 py-2"
					/>
				</div>

				{/* Witness Names */}
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-2">
						Witness Names
					</label>
					<textarea
						name="witnessNames"
						value={formData.witnessNames}
						onChange={handleChange}
						rows={2}
						placeholder="List any witnesses to the incident..."
						className="w-full border rounded px-3 py-2"
					/>
				</div>

				{/* Follow-up Required */}
				<div className="border rounded-lg p-4 bg-gray-50">
					<label className="flex items-start space-x-3">
						<input
							type="checkbox"
							name="followUpRequired"
							checked={formData.followUpRequired}
							onChange={handleChange}
							className="mt-1 h-5 w-5 rounded border-gray-300"
						/>
						<div className="flex-1">
							<span className="font-medium text-gray-900">
								Follow-up Required
							</span>
							<p className="text-sm text-gray-600 mt-1">
								Check this box if this incident requires additional follow-up
								actions or monitoring
							</p>
						</div>
					</label>

					{formData.followUpRequired && (
						<div className="mt-4">
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Follow-up Notes
							</label>
							<textarea
								name="followUpNotes"
								value={formData.followUpNotes}
								onChange={handleChange}
								rows={3}
								placeholder="Describe what follow-up actions are needed..."
								className="w-full border rounded px-3 py-2"
							/>
						</div>
					)}
				</div>

				{/* Action Buttons */}
				<div className="flex justify-end gap-3 pt-4 border-t">
					{onCancel && (
						<button
							type="button"
							onClick={onCancel}
							className="px-6 py-2 border rounded hover:bg-gray-50">
							Cancel
						</button>
					)}
					<button
						type="submit"
						disabled={submitting}
						className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
						{submitting ? 'Submitting...' : 'Submit Incident Report'}
					</button>
				</div>
			</form>
		</div>
	);
}
