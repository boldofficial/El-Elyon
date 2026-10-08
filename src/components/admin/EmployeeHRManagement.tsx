// src/components/admin/EmployeeHRManagement.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';
import EmployeeTrainingManagement from './EmployeeTrainingManagement';
import StaffDocumentsWorkspace from '../shared/StaffDocumentsWorkspace';

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
				<h2 className="text-xl font-bold mb-4">HR Details</h2>

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

					{/* Expiry dates. The documents themselves live in Staff Documents
					    below, where privileged supervisors can also reach them. */}
					<div className="grid gap-4 sm:grid-cols-2">
						<label className="block">
							<span className="block text-sm font-medium text-gray-700 mb-1">
								TB Test expires
							</span>
							<input
								type="date"
								value={
									employee.tbTestExpiresAt
										? new Date(employee.tbTestExpiresAt).toISOString().split('T')[0]
										: ''
								}
								onChange={(e) =>
									handleUpdateHRInfo({
										tbTestExpiresAt: e.target.value ? new Date(e.target.value) : undefined,
									})
								}
								className="border rounded px-3 py-2"
							/>
						</label>
						<label className="block">
							<span className="block text-sm font-medium text-gray-700 mb-1">
								Background Check expires (every 4 years)
							</span>
							<input
								type="date"
								value={
									employee.backgroundCheckExpiresAt
										? new Date(employee.backgroundCheckExpiresAt).toISOString().split('T')[0]
										: ''
								}
								onChange={(e) =>
									handleUpdateHRInfo({
										backgroundCheckExpiresAt: e.target.value ? new Date(e.target.value) : undefined,
									})
								}
								className="border rounded px-3 py-2"
							/>
						</label>
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

			{/* Staff Documents (TB test, background check, application, ...) */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-1">Staff Documents</h2>
				<p className="text-sm text-gray-600 mb-4">
					Supervisors with &quot;View Staff Documents&quot; at {employee.name}&apos;s locations can download these for inspectors.
				</p>
				<StaffDocumentsWorkspace employeeId={employeeId} />
			</div>

			{/* Training Documentation Section */}
			<EmployeeTrainingManagement
				employeeId={employeeId}
				refreshTrigger={trainingRefreshTrigger}
			/>
		</div>
	);
}
