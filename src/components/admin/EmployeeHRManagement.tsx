// src/components/admin/EmployeeHRManagement.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

interface Employee {
	id: string;
	name: string;
	dateOfHire?: Date;
	tbTestFileId?: string;
	tbTestExpiresAt?: Date;
	backgroundCheckFileId?: string;
	backgroundCheckExpiresAt?: Date;
	applicationFormFileId?: string;
	personalBio?: string;
}

interface Training {
	id: string;
	trainingName: string;
	trainingYear: number;
	completed: boolean;
	completedDate?: Date;
	certificateFileId?: string;
	notes?: string;
}

export default function EmployeeHRManagement({
	employeeId,
}: {
	employeeId: string;
}) {
	const [employee, setEmployee] = useState<Employee | null>(null);
	const [trainings, setTrainings] = useState<Training[]>([]);
	const [loading, setLoading] = useState(true);
	const [showTrainingForm, setShowTrainingForm] = useState(false);

	// File upload handler
	const handleFileUpload = async (file: File, fileType: string) => {
		const formData = new FormData();
		formData.append('file', file);
		formData.append('fileType', fileType);

		try {
			const res = await fetch('/api/uploads', {
				method: 'POST',
				body: formData,
			});

			if (!res.ok) throw new Error('Upload failed');

			const data = await res.json();
			toast.success('File uploaded successfully');
			return data;
		} catch (error) {
			console.error('Upload error:', error);
			toast.error('Failed to upload file');
			return null;
		}
	};

	// Fetch employee HR data
	useEffect(() => {
		async function fetchData() {
			try {
				const [empRes, trainRes] = await Promise.all([
					fetch(`/api/admin/employees/${employeeId}/hr`),
					fetch(`/api/admin/employees/${employeeId}/trainings`),
				]);

				const empData = await empRes.json();
				const trainData = await trainRes.json();

				setEmployee(empData);
				setTrainings(trainData);
			} catch (error) {
				console.error('Error fetching data:', error);
				toast.error('Failed to load employee data');
			} finally {
				setLoading(false);
			}
		}

		fetchData();
	}, [employeeId]);

	const handleUpdateHRInfo = async (data: Partial<Employee>) => {
		try {
			const res = await fetch(`/api/admin/employees/${employeeId}/hr`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(data),
			});

			if (!res.ok) throw new Error('Failed to update');

			const updated = await res.json();
			setEmployee(updated);
			toast.success('HR information updated');
		} catch (error) {
			toast.error('Failed to update HR information');
			console.error(error);
		}
	};

	const handleToggleTrainingCompletion = async (
		trainingId: string,
		completed: boolean
	) => {
		try {
			const res = await fetch(`/api/admin/employees/trainings/${trainingId}`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({toggleCompletion: !completed}),
			});

			if (!res.ok) throw new Error('Failed to toggle');

			// Refresh trainings
			const trainRes = await fetch(
				`/api/admin/employees/${employeeId}/trainings`
			);
			const trainData = await trainRes.json();
			setTrainings(trainData);

			toast.success('Training status updated');
		} catch (error) {
			toast.error('Failed to update training status');
		}
	};

	const handleAddTraining = async (training: {
		trainingName: string;
		trainingYear: number;
	}) => {
		try {
			const res = await fetch(`/api/admin/employees/${employeeId}/trainings`, {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(training),
			});

			if (!res.ok) throw new Error('Failed to create');

			// Refresh trainings
			const trainRes = await fetch(
				`/api/admin/employees/${employeeId}/trainings`
			);
			const trainData = await trainRes.json();
			setTrainings(trainData);

			setShowTrainingForm(false);
			toast.success('Training added');
		} catch (error) {
			toast.error('Failed to add training');
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		);
	}

	if (!employee) {
		return <div>Employee not found</div>;
	}

	return (
		<div className="space-y-6">
			{/* HR Documents Section */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">HR Documents</h2>

				<div className="space-y-4">
					{/* Date of Hire */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Date of Hire
						</label>
						<input
							type="date"
							value={
								employee.dateOfHire
									? new Date(employee.dateOfHire).toISOString().split('T')[0]
									: ''
							}
							onChange={(e) =>
								handleUpdateHRInfo({
									dateOfHire: new Date(e.target.value),
								})
							}
							className="border rounded px-3 py-2"
						/>
					</div>

					{/* TB Test */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							TB Test
						</label>
						<div className="space-y-2">
							<div className="flex gap-2">
								<input
									type="file"
									accept=".pdf,.doc,.docx"
									onChange={async (e) => {
										const file = e.target.files?.[0];
										if (file) {
											const uploaded = await handleFileUpload(file, 'tb_test');
											if (uploaded) {
												handleUpdateHRInfo({tbTestFileId: uploaded.fileId});
											}
										}
									}}
									className="border rounded px-3 py-2 flex-1"
								/>
								<input
									type="date"
									value={
										employee.tbTestExpiresAt
											? new Date(employee.tbTestExpiresAt)
													.toISOString()
													.split('T')[0]
											: ''
									}
									onChange={(e) =>
										handleUpdateHRInfo({
											tbTestExpiresAt: new Date(e.target.value),
										})
									}
									placeholder="Expiration date"
									className="border rounded px-3 py-2"
								/>
							</div>
							{employee.tbTestFileId && (
								<a
									href={`/api/uploads?fileId=${employee.tbTestFileId}&fileType=tb_test`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-600 hover:underline text-sm">
									View Current TB Test Document
								</a>
							)}
						</div>
					</div>

					{/* Background Check */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Background Check (every 4 years)
						</label>
						<div className="space-y-2">
							<div className="flex gap-2">
								<input
									type="file"
									accept=".pdf,.doc,.docx"
									onChange={async (e) => {
										const file = e.target.files?.[0];
										if (file) {
											const uploaded = await handleFileUpload(
												file,
												'background_check'
											);
											if (uploaded) {
												handleUpdateHRInfo({
													backgroundCheckFileId: uploaded.fileId,
												});
											}
										}
									}}
									className="border rounded px-3 py-2 flex-1"
								/>
								<input
									type="date"
									value={
										employee.backgroundCheckExpiresAt
											? new Date(employee.backgroundCheckExpiresAt)
													.toISOString()
													.split('T')[0]
											: ''
									}
									onChange={(e) =>
										handleUpdateHRInfo({
											backgroundCheckExpiresAt: new Date(e.target.value),
										})
									}
									placeholder="Expiration date"
									className="border rounded px-3 py-2"
								/>
							</div>
							{employee.backgroundCheckFileId && (
								<a
									href={`/api/uploads?fileId=${employee.backgroundCheckFileId}&fileType=background_check`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-600 hover:underline text-sm">
									View Current Background Check
								</a>
							)}
						</div>
					</div>

					{/* Application Form */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Application Form
						</label>
						<div className="space-y-2">
							<input
								type="file"
								accept=".pdf,.doc,.docx"
								onChange={async (e) => {
									const file = e.target.files?.[0];
									if (file) {
										const uploaded = await handleFileUpload(
											file,
											'application_form'
										);
										if (uploaded) {
											handleUpdateHRInfo({
												applicationFormFileId: uploaded.fileId,
											});
										}
									}
								}}
								className="border rounded px-3 py-2 w-full"
							/>
							{employee.applicationFormFileId && (
								<a
									href={`/api/uploads?fileId=${employee.applicationFormFileId}&fileType=application_form`}
									target="_blank"
									rel="noopener noreferrer"
									className="text-blue-600 hover:underline text-sm">
									View Application Form
								</a>
							)}
						</div>
					</div>

					{/* Personal Bio */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Personal Bio
						</label>
						<textarea
							value={employee.personalBio || ''}
							onChange={(e) =>
								handleUpdateHRInfo({personalBio: e.target.value})
							}
							rows={4}
							className="w-full border rounded px-3 py-2"
							placeholder="Enter personal bio..."
						/>
					</div>
				</div>
			</div>

			{/* Training Documentation Section */}
			<div className="bg-white rounded-lg shadow p-6">
				<div className="flex justify-between items-center mb-4">
					<h2 className="text-xl font-bold">Training Documentation</h2>
					<button
						onClick={() => setShowTrainingForm(!showTrainingForm)}
						className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
						{showTrainingForm ? 'Cancel' : '+ Add Training'}
					</button>
				</div>

				{showTrainingForm && (
					<div className="bg-gray-50 p-4 rounded mb-4">
						<form
							onSubmit={(e) => {
								e.preventDefault();
								const formData = new FormData(e.currentTarget);
								handleAddTraining({
									trainingName: formData.get('trainingName') as string,
									trainingYear: parseInt(
										formData.get('trainingYear') as string
									),
								});
							}}>
							<div className="grid grid-cols-2 gap-4 mb-4">
								<input
									name="trainingName"
									placeholder="Training name"
									required
									className="border rounded px-3 py-2"
								/>
								<input
									name="trainingYear"
									type="number"
									placeholder="Year"
									required
									min="2000"
									max="2100"
									className="border rounded px-3 py-2"
								/>
							</div>
							<button
								type="submit"
								className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700">
								Add Training
							</button>
						</form>
					</div>
				)}

				{/* Training List */}
				<div className="overflow-x-auto">
					<table className="w-full">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-4 py-2 text-left">Training Name</th>
								<th className="px-4 py-2 text-left">Year</th>
								<th className="px-4 py-2 text-left">Status</th>
								<th className="px-4 py-2 text-left">Completed Date</th>
								<th className="px-4 py-2 text-left">Actions</th>
							</tr>
						</thead>
						<tbody>
							{trainings.length === 0 ? (
								<tr>
									<td
										colSpan={5}
										className="px-4 py-8 text-center text-gray-500">
										No trainings added yet
									</td>
								</tr>
							) : (
								trainings.map((training) => (
									<tr key={training.id} className="border-t">
										<td className="px-4 py-2">{training.trainingName}</td>
										<td className="px-4 py-2">{training.trainingYear}</td>
										<td className="px-4 py-2">
											<button
												onClick={() =>
													handleToggleTrainingCompletion(
														training.id,
														training.completed
													)
												}
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
											<button className="text-blue-600 hover:text-blue-800 text-sm">
												Edit
											</button>
										</td>
									</tr>
								))
							)}
						</tbody>
					</table>
				</div>
			</div>
		</div>
	);
}
