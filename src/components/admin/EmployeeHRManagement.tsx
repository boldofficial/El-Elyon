// src/components/admin/EmployeeHRManagement.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';
import EmployeeTrainingManagement from './EmployeeTrainingManagement'; // Import the new component

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

export default function EmployeeHRManagement({
	employeeId,
}: {
	employeeId: string;
}) {
	const [employee, setEmployee] = useState<Employee | null>(null);
	const [loading, setLoading] = useState(true);
	const [trainingRefreshTrigger, setTrainingRefreshTrigger] = useState(0); // To trigger refresh of trainings

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
				const empRes = await fetch(`/api/admin/employees/${employeeId}/hr`);
				if (!empRes.ok) throw new Error('Failed to fetch employee HR data');
				const empData = await empRes.json();
				setEmployee(empData);
			} catch (error) {
				console.error('Error fetching employee HR data:', error);
				toast.error('Failed to load employee HR data');
			} finally {
				setLoading(false);
			}
		}

		fetchData();
	}, [employeeId, trainingRefreshTrigger]); // Added trainingRefreshTrigger to re-fetch if trainings are updated externally

	const handleUpdateHRInfo = async (data: Partial<Employee>) => {
		try {
			const res = await fetch(`/api/admin/employees/${employeeId}/hr`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(data),
			});

			if (!res.ok) throw new Error('Failed to update HR information');

			const updated = await res.json();
			setEmployee(updated);
			toast.success('HR information updated');
			setTrainingRefreshTrigger((prev) => prev + 1); // Trigger refresh of trainings
		} catch (error) {
			toast.error('Failed to update HR information');
			console.error(error);
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
									dateOfHire: e.target.value ? new Date(e.target.value) : undefined,
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
											tbTestExpiresAt: e.target.value ? new Date(e.target.value) : undefined,
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
											backgroundCheckExpiresAt: e.target.value ? new Date(e.target.value) : undefined,
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

			{/* Training Documentation Section - now handled by separate component */}
			<EmployeeTrainingManagement
				employeeId={employeeId}
				refreshTrigger={trainingRefreshTrigger}
			/>
		</div>
	);
}
