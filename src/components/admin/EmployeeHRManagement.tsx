// src/components/admin/EmployeeHRManagement.tsx

'use client';

import React, {useState, useEffect, useRef} from 'react';
import {toast} from 'sonner';
import EmployeeTrainingManagement from './EmployeeTrainingManagement';

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
	const [trainingRefreshTrigger, setTrainingRefreshTrigger] = useState(0);
	const [personalBio, setPersonalBio] = useState('');
	const [isSavingBio, setIsSavingBio] = useState(false);

	// Refs for file inputs
	const tbTestRef = useRef<HTMLInputElement>(null);
	const bgCheckRef = useRef<HTMLInputElement>(null);
	const appFormRef = useRef<HTMLInputElement>(null);
	
	// State to track if file is selected (for showing X button)
	const [hasTbFile, setHasTbFile] = useState(false);
	const [hasBgFile, setHasBgFile] = useState(false);
	const [hasAppFile, setHasAppFile] = useState(false);
	
	// State to track uploaded file IDs (for deletion)
	const [uploadedTbFileId, setUploadedTbFileId] = useState<string | null>(null);
	const [uploadedBgFileId, setUploadedBgFileId] = useState<string | null>(null);
	const [uploadedAppFileId, setUploadedAppFileId] = useState<string | null>(null);

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

	// File delete handler
	const handleDeleteFile = async (fileId: string, fileType: string) => {
		try {
			const res = await fetch(`/api/uploads?fileId=${fileId}&fileType=${fileType}`, {
				method: 'DELETE',
			});

			if (!res.ok) throw new Error('Delete failed');
			return true;
		} catch (error) {
			console.error('Delete error:', error);
			return false;
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
				setPersonalBio(empData.personalBio || '');
			} catch (error) {
				console.error('Error fetching employee HR data:', error);
				toast.error('Failed to load employee HR data');
			} finally {
				setLoading(false);
			}
		}

		fetchData();
	}, [employeeId]);

	// Separate effect for training refresh - don't refetch employee data
	useEffect(() => {
		// This only triggers training component refresh, not main data fetch
	}, [trainingRefreshTrigger]);

	const handleUpdateHRInfo = async (data: Partial<Employee>, showToast = true) => {
		try {
			const res = await fetch(`/api/admin/employees/${employeeId}/hr`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(data),
			});

			if (!res.ok) throw new Error('Failed to update HR information');

			const updated = await res.json();
			setEmployee(updated);
			if (showToast) {
				toast.success('HR information updated');
			}
			return true;
		} catch (error) {
			toast.error('Failed to update HR information');
			console.error(error);
			return false;
		}
	};

	const handleSaveBio = async () => {
		if (employee?.personalBio === personalBio) return; // No changes
		
		setIsSavingBio(true);
		const success = await handleUpdateHRInfo({personalBio}, true);
		setIsSavingBio(false);
		
		if (success) {
			// Training refresh is not needed for bio update
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
									<div className="relative flex-1">
									<input
										ref={tbTestRef}
										type="file"
										accept=".pdf,.doc,.docx"
										onChange={async (e) => {
											const file = e.target.files?.[0];
											setHasTbFile(!!file);
											if (file) {
												const uploaded = await handleFileUpload(file, 'tb_test');
												if (uploaded) {
													setUploadedTbFileId(uploaded.fileId);
													handleUpdateHRInfo({tbTestFileId: uploaded.fileId});
												}
											}
										}}
										className="border rounded px-3 py-2 w-full pr-8"
									/>
									{hasTbFile && (
										<button
											type="button"
											onClick={async () => { 
												if (tbTestRef.current) tbTestRef.current.value = ''; 
												setHasTbFile(false);
												const fileIdToDelete = uploadedTbFileId || employee?.tbTestFileId;
												if (fileIdToDelete) {
													await handleDeleteFile(fileIdToDelete, 'tb_test');
													await handleUpdateHRInfo({tbTestFileId: undefined}, false);
													setUploadedTbFileId(null);
													toast.success('Uploaded file deleted');
												}
											}}
											className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg font-bold"
											title="Clear file">
											×
										</button>
									)}
								</div>
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
									<div className="relative flex-1">
									<input
										ref={bgCheckRef}
										type="file"
										accept=".pdf,.doc,.docx"
										onChange={async (e) => {
											const file = e.target.files?.[0];
											setHasBgFile(!!file);
											if (file) {
												const uploaded = await handleFileUpload(
													file,
													'background_check'
												);
												if (uploaded) {
													setUploadedBgFileId(uploaded.fileId);
													handleUpdateHRInfo({
														backgroundCheckFileId: uploaded.fileId,
													});
												}
											}
										}}
										className="border rounded px-3 py-2 w-full pr-8"
									/>
									{hasBgFile && (
										<button
											type="button"
											onClick={async () => { 
												if (bgCheckRef.current) bgCheckRef.current.value = ''; 
												setHasBgFile(false);
												const fileIdToDelete = uploadedBgFileId || employee?.backgroundCheckFileId;
												if (fileIdToDelete) {
													await handleDeleteFile(fileIdToDelete, 'background_check');
													await handleUpdateHRInfo({backgroundCheckFileId: undefined}, false);
													setUploadedBgFileId(null);
													toast.success('Uploaded file deleted');
												}
											}}
											className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg font-bold"
											title="Clear file">
											×
										</button>
									)}
								</div>
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
							<div className="flex gap-2">
									<div className="relative flex-1">
									<input
										ref={appFormRef}
										type="file"
										accept=".pdf,.doc,.docx"
										onChange={async (e) => {
											const file = e.target.files?.[0];
											setHasAppFile(!!file);
											if (file) {
												const uploaded = await handleFileUpload(
													file,
													'application_form'
												);
												if (uploaded) {
													setUploadedAppFileId(uploaded.fileId);
													handleUpdateHRInfo({
														applicationFormFileId: uploaded.fileId,
													});
												}
											}
										}}
										className="border rounded px-3 py-2 w-full pr-8"
									/>
									{hasAppFile && (
										<button
											type="button"
											onClick={async () => { 
												if (appFormRef.current) appFormRef.current.value = ''; 
												setHasAppFile(false);
												const fileIdToDelete = uploadedAppFileId || employee?.applicationFormFileId;
												if (fileIdToDelete) {
													await handleDeleteFile(fileIdToDelete, 'application_form');
													await handleUpdateHRInfo({applicationFormFileId: undefined}, false);
													setUploadedAppFileId(null);
													toast.success('Uploaded file deleted');
												}
											}}
											className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg font-bold"
											title="Clear file">
											×
										</button>
									)}
								</div>
							</div>
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
							value={personalBio}
							onChange={(e) => setPersonalBio(e.target.value)}
							onBlur={handleSaveBio}
							rows={4}
							className="w-full border rounded px-3 py-2"
							placeholder="Enter personal bio..."
						/>
						{isSavingBio && (
							<span className="text-gray-500 text-sm">Saving...</span>
						)}
					</div>
				</div>
			</div>

			{/* Training Documentation Section */}
			<EmployeeTrainingManagement
				employeeId={employeeId}
				refreshTrigger={trainingRefreshTrigger}
			/>
		</div>
	);
}
