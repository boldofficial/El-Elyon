// src/components/admin/EmployeeTrainingManagement.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

interface Training {
	id: string;
	employeeId: string;
	trainingName: string;
	trainingYear: number;
	completed: boolean;
	completedDate?: Date;
	certificateFileId?: string;
	notes?: string;
	createdBy: string;
	createdAt: Date;
	updatedAt?: Date;
	updatedBy?: string;
}

interface EmployeeTrainingManagementProps {
	employeeId: string;
	refreshTrigger?: number;
}

export default function EmployeeTrainingManagement({
	employeeId,
	refreshTrigger,
}: EmployeeTrainingManagementProps) {
	const [trainings, setTrainings] = useState<Training[]>([]);
	const [loading, setLoading] = useState(true);
	const [uploading, setUploading] = useState<string | null>(null);
	const [showAddForm, setShowAddForm] = useState(false);
	const [editingTraining, setEditingTraining] = useState<Training | null>(null);
	const [addFormData, setAddFormData] = useState({
		trainingName: '',
		trainingYear: new Date().getFullYear(),
		completed: false,
		completedDate: '',
		certificateFileId: '',
		notes: '',
	});
	const [editFormData, setEditFormData] = useState({
		trainingName: '',
		trainingYear: new Date().getFullYear(),
		completed: false,
		completedDate: '',
		certificateFileId: '',
		notes: '',
	});

	// ADDED: File upload handler for training certificates
	const handleCertificateUpload = async (file: File) => {
		setUploading('certificate');
		try {
			const urlResponse = await fetch('/api/hr/generate-upload-url', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					filename: file.name,
					contentType: file.type,
					fileType: 'training_certificates',
				}),
			});

			if (!urlResponse.ok) throw new Error('Failed to get upload URL');
			const {uploadUrl, fileKey} = await urlResponse.json();

			const uploadResponse = await fetch(uploadUrl, {
				method: 'PUT',
				body: file,
				headers: {'Content-Type': file.type},
			});

			if (!uploadResponse.ok) throw new Error('Failed to upload file');

			toast.success('Certificate uploaded successfully');
			return fileKey;
		} catch (error) {
			console.error('Upload error:', error);
			toast.error('Failed to upload certificate');
			return null;
		} finally {
			setUploading(null);
		}
	};

	// ADDED: Download certificate handler
	const handleDownloadCertificate = async (fileKey: string) => {
		try {
			const res = await fetch(`/api/hr/download-url?fileKey=${fileKey}`);
			if (!res.ok) throw new Error('Failed to get download URL');

			const {downloadUrl} = await res.json();
			window.open(downloadUrl, '_blank');
		} catch (error) {
			console.error('Download error:', error);
			toast.error('Failed to download certificate');
		}
	};

	useEffect(() => {
		fetchTrainings();
	}, [employeeId, refreshTrigger]);

	async function fetchTrainings() {
		try {
			const res = await fetch(`/api/admin/employees/${employeeId}/trainings`);
			if (!res.ok) throw new Error('Failed to fetch trainings');
			const data = await res.json();
			setTrainings(data);
		} catch (error) {
			console.error('Error fetching trainings:', error);
			toast.error('Failed to load trainings');
		} finally {
			setLoading(false);
		}
	}

	const handleAddChange = (
		e: React.ChangeEvent<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>
	) => {
		const {name, value, type, checked} = e.target as HTMLInputElement;
		setAddFormData((prev) => ({
			...prev,
			[name]: type === 'checkbox' ? checked : value,
		}));
	};

	const handleEditChange = (
		e: React.ChangeEvent<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>
	) => {
		const {name, value, type, checked} = e.target as HTMLInputElement;
		setEditFormData((prev) => ({
			...prev,
			[name]: type === 'checkbox' ? checked : value,
		}));
	};

	const handleAddSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		try {
			const res = await fetch(`/api/admin/employees/${employeeId}/trainings`, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					...addFormData,
					trainingYear: Number(addFormData.trainingYear),
					completedDate: addFormData.completedDate
						? new Date(addFormData.completedDate)
						: undefined,
				}),
			});

			if (!res.ok) throw new Error('Failed to add training');
			toast.success('Training added successfully');
			setAddFormData({
				trainingName: '',
				trainingYear: new Date().getFullYear(),
				completed: false,
				completedDate: '',
				certificateFileId: '',
				notes: '',
			});
			setShowAddForm(false);
			fetchTrainings();
		} catch (error) {
			console.error('Error adding training:', error);
			toast.error('Failed to add training');
		}
	};

	const handleUpdateSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingTraining) return;

		try {
			const res = await fetch(
				`/api/admin/employees/${employeeId}/trainings/${editingTraining.id}`,
				{
					method: 'PATCH',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({
						...editFormData,
						trainingYear: Number(editFormData.trainingYear),
						completedDate: editFormData.completedDate
							? new Date(editFormData.completedDate)
							: undefined,
					}),
				}
			);

			if (!res.ok) throw new Error('Failed to update training');
			toast.success('Training updated successfully');
			setEditingTraining(null);
			fetchTrainings();
		} catch (error) {
			console.error('Error updating training:', error);
			toast.error('Failed to update training');
		}
	};

	const handleDeleteTraining = async (trainingId: string) => {
		if (!window.confirm('Are you sure you want to delete this training?'))
			return;
		try {
			const res = await fetch(
				`/api/admin/employees/${employeeId}/trainings/${trainingId}`,
				{
					method: 'DELETE',
					headers: {'Content-Type': 'application/json'},
				}
			);

			if (!res.ok) throw new Error('Failed to delete training');
			toast.success('Training deleted successfully');
			fetchTrainings();
		} catch (error) {
			console.error('Error deleting training:', error);
			toast.error('Failed to delete training');
		}
	};

	const handleToggleCompletion = async (training: Training) => {
		try {
			const res = await fetch(
				`/api/admin/employees/${employeeId}/trainings/${training.id}`,
				{
					method: 'PATCH',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({
						completed: !training.completed,
					}),
				}
			);

			if (!res.ok) throw new Error('Failed to toggle completion');
			toast.success('Training completion status updated');
			fetchTrainings();
		} catch (error) {
			console.error('Error toggling training completion:', error);
			toast.error('Failed to update completion status');
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
			<div className="flex justify-between items-center mb-4">
				<h2 className="text-xl font-bold">Training Documentation</h2>
				<button
					onClick={() => {
						setShowAddForm(!showAddForm);
						setEditingTraining(null);
						setAddFormData({
							trainingName: '',
							trainingYear: new Date().getFullYear(),
							completed: false,
							completedDate: '',
							certificateFileId: '',
							notes: '',
						});
					}}
					className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
					{showAddForm ? 'Cancel Add' : '+ Add Training'}
				</button>
			</div>

			{showAddForm && (
				<div className="bg-gray-50 p-4 rounded mb-4">
					<h3 className="text-lg font-semibold mb-3">Add New Training</h3>
					<form onSubmit={handleAddSubmit} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Training Name
							</label>
							<input
								type="text"
								name="trainingName"
								value={addFormData.trainingName}
								onChange={handleAddChange}
								required
								className="w-full border rounded px-3 py-2"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Training Year
							</label>
							<input
								type="number"
								name="trainingYear"
								value={addFormData.trainingYear}
								onChange={handleAddChange}
								required
								min="2000"
								max="2100"
								className="w-full border rounded px-3 py-2"
							/>
						</div>
						<div>
							<label className="flex items-center text-sm font-medium text-gray-700">
								<input
									type="checkbox"
									name="completed"
									checked={addFormData.completed}
									onChange={handleAddChange}
									className="mr-2 rounded border-gray-300"
								/>
								Completed
							</label>
						</div>
						{addFormData.completed && (
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Completion Date
								</label>
								<input
									type="date"
									name="completedDate"
									value={addFormData.completedDate}
									onChange={handleAddChange}
									className="w-full border rounded px-3 py-2"
								/>
							</div>
						)}
						{/* FIXED: Certificate file upload */}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Certificate
							</label>
							<input
								type="file"
								accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
								disabled={uploading === 'certificate'}
								onChange={async (e) => {
									const file = e.target.files?.[0];
									if (file) {
										const fileKey = await handleCertificateUpload(file);
										if (fileKey) {
											setAddFormData((prev) => ({
												...prev,
												certificateFileId: fileKey,
											}));
										}
									}
								}}
								className="w-full border rounded px-3 py-2 disabled:opacity-50"
							/>
							{uploading === 'certificate' && (
								<p className="text-sm text-blue-600 mt-1">Uploading...</p>
							)}
							{addFormData.certificateFileId && (
								<p className="text-sm text-green-600 mt-1">
									✓ Certificate uploaded
								</p>
							)}
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Notes
							</label>
							<textarea
								name="notes"
								value={addFormData.notes}
								onChange={handleAddChange}
								rows={3}
								className="w-full border rounded px-3 py-2"
							/>
						</div>
						<button
							type="submit"
							disabled={uploading === 'certificate'}
							className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
							Add Training
						</button>
					</form>
				</div>
			)}

			{editingTraining && (
				<div className="bg-blue-50 p-4 rounded mb-4 border border-blue-200">
					<h3 className="text-lg font-semibold mb-3">
						Edit Training: {editingTraining.trainingName}
					</h3>
					<form onSubmit={handleUpdateSubmit} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Training Name
							</label>
							<input
								type="text"
								name="trainingName"
								value={editFormData.trainingName}
								onChange={handleEditChange}
								required
								className="w-full border rounded px-3 py-2"
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Training Year
							</label>
							<input
								type="number"
								name="trainingYear"
								value={editFormData.trainingYear}
								onChange={handleEditChange}
								required
								min="2000"
								max="2100"
								className="w-full border rounded px-3 py-2"
							/>
						</div>
						<div>
							<label className="flex items-center text-sm font-medium text-gray-700">
								<input
									type="checkbox"
									name="completed"
									checked={editFormData.completed}
									onChange={handleEditChange}
									className="mr-2 rounded border-gray-300"
								/>
								Completed
							</label>
						</div>
						{editFormData.completed && (
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Completion Date
								</label>
								<input
									type="date"
									name="completedDate"
									value={editFormData.completedDate}
									onChange={handleEditChange}
									className="w-full border rounded px-3 py-2"
								/>
							</div>
						)}
						{/* FIXED: Certificate file upload for edit */}
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Certificate
							</label>
							<input
								type="file"
								accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
								disabled={uploading === 'certificate'}
								onChange={async (e) => {
									const file = e.target.files?.[0];
									if (file) {
										const fileKey = await handleCertificateUpload(file);
										if (fileKey) {
											setEditFormData((prev) => ({
												...prev,
												certificateFileId: fileKey,
											}));
										}
									}
								}}
								className="w-full border rounded px-3 py-2 disabled:opacity-50"
							/>
							{uploading === 'certificate' && (
								<p className="text-sm text-blue-600 mt-1">Uploading...</p>
							)}
							{editFormData.certificateFileId && (
								<button
									type="button"
									onClick={() =>
										handleDownloadCertificate(editFormData.certificateFileId)
									}
									className="text-blue-600 hover:underline text-sm mt-1">
									📄 View Current Certificate
								</button>
							)}
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Notes
							</label>
							<textarea
								name="notes"
								value={editFormData.notes}
								onChange={handleEditChange}
								rows={3}
								className="w-full border rounded px-3 py-2"
							/>
						</div>
						<div className="flex gap-2 mt-4">
							<button
								type="submit"
								disabled={uploading === 'certificate'}
								className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
								Update Training
							</button>
							<button
								type="button"
								onClick={() => setEditingTraining(null)}
								className="px-4 py-2 border rounded hover:bg-gray-50">
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Training List */}
			<div className="overflow-x-auto">
				{trainings.length === 0 ? (
					<div className="text-center py-8 text-gray-500">
						No trainings added yet. Click &quot; + Add Training&quot; to start.
					</div>
				) : (
					<table className="w-full">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-4 py-2 text-left">Training Name</th>
								<th className="px-4 py-2 text-left">Year</th>
								<th className="px-4 py-2 text-left">Status</th>
								<th className="px-4 py-2 text-left">Completed Date</th>
								<th className="px-4 py-2 text-left">Certificate</th>
								<th className="px-4 py-2 text-left">Actions</th>
							</tr>
						</thead>
						<tbody>
							{trainings.map((training) => (
								<tr key={training.id} className="border-t">
									<td className="px-4 py-2">{training.trainingName}</td>
									<td className="px-4 py-2">{training.trainingYear}</td>
									<td className="px-4 py-2">
										<button
											onClick={() => handleToggleCompletion(training)}
											className={`px-3 py-1 rounded text-sm ${
												training.completed
													? 'bg-green-100 text-green-800'
													: 'bg-gray-100 text-gray-800'
											}`}>
											{training.completed ? 'Completed' : 'Not Completed'}
										</button>
									</td>
									<td className="px-4 py-2">
										{training.completedDate
											? new Date(training.completedDate).toLocaleDateString()
											: '-'}
									</td>
									<td className="px-4 py-2">
										{training.certificateFileId ? (
											<button
												onClick={() =>
													handleDownloadCertificate(training.certificateFileId!)
												}
												className="text-blue-600 hover:underline text-sm">
												📄 View
											</button>
										) : (
											'-'
										)}
									</td>
									<td className="px-4 py-2 flex gap-2">
										<button
											onClick={() => {
												setEditingTraining(training);
												setEditFormData({
													trainingName: training.trainingName,
													trainingYear: training.trainingYear,
													completed: training.completed,
													completedDate: training.completedDate
														? new Date(training.completedDate)
																.toISOString()
																.split('T')[0]
														: '',
													certificateFileId: training.certificateFileId || '',
													notes: training.notes || '',
												});
												setShowAddForm(false);
											}}
											className="text-blue-600 hover:text-blue-800 text-sm">
											Edit
										</button>
										<button
											onClick={() => handleDeleteTraining(training.id)}
											className="text-red-600 hover:text-red-800 text-sm">
											Delete
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
