// src/components/admin/ResidentProfileManagement.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

interface Resident {
	id: string;
	name: string;
	dateOfBirth?: string;
	phone?: string;
	placementDate?: Date;
	sex?: string;
	weight?: string;
	height?: string;
	hairColor?: string;
	diagnosis?: string;
	supportBroker?: string;
	importantRelationships?: string;
	fundingAgency?: string;
	caseManagerName?: string;
	caseManagerPhone?: string;
	caseManagerEmail?: string;
	vocationalAgency?: string;
	vocationalAgencyAddress?: string;
	location?: string;
	guardianIds?: string[];
}

export default function ResidentProfileManagement({
	residentId,
}: {
	residentId: string;
}) {
	const [resident, setResident] = useState<Resident | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		async function fetchResident() {
			try {
				const res = await fetch(`/api/admin/residents/${residentId}/profile`);
				if (!res.ok) throw new Error('Failed to fetch');

				const data = await res.json();
				setResident(data);
			} catch (error) {
				console.error('Error fetching resident:', error);
				toast.error('Failed to load resident data');
			} finally {
				setLoading(false);
			}
		}

		fetchResident();
	}, [residentId]);

	const handleChange = (
		e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
	) => {
		const {name, value} = e.target;
		setResident((prev) => (prev ? {...prev, [name]: value} : null));
	};

	const handleSave = async () => {
		if (!resident) return;

		setSaving(true);
		try {
			const res = await fetch(`/api/admin/residents/${residentId}/profile`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(resident),
			});

			if (!res.ok) throw new Error('Failed to update');

			const updated = await res.json();
			setResident(updated);
			toast.success('Resident profile updated successfully');
		} catch (error) {
			console.error('Error updating resident:', error);
			toast.error('Failed to update resident profile');
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
			</div>
		);
	}

	if (!resident) {
		return <div>Resident not found</div>;
	}

	return (
		<div className="space-y-6">
			{/* Personal Information */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Personal Information</h2>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="block text-sm font-medium mb-1">Name</label>
						<input
							type="text"
							name="name"
							value={resident.name}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Date of Birth
						</label>
						<input
							type="date"
							name="dateOfBirth"
							value={resident.dateOfBirth || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Phone</label>
						<input
							type="tel"
							name="phone"
							value={resident.phone || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Placement Date
						</label>
						<input
							type="date"
							name="placementDate"
							value={
								resident.placementDate
									? new Date(resident.placementDate).toISOString().split('T')[0]
									: ''
							}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Sex</label>
						<select
              id="sex"
              title="Sex"
							name="sex"
							value={resident.sex || ''}
							onChange={handleChange as any}
							className="w-full border rounded px-3 py-2">
							<option value="">Select...</option>
							<option value="Male">Male</option>
							<option value="Female">Female</option>
							<option value="Other">Other</option>
						</select>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Weight</label>
						<input
							type="text"
							name="weight"
							value={resident.weight || ''}
							onChange={handleChange}
							placeholder="e.g., 150 lbs"
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Height</label>
						<input
							type="text"
							name="height"
							value={resident.height || ''}
							onChange={handleChange}
							placeholder="e.g., 5'8&quot;"
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">Hair Color</label>
						<input
							type="text"
							name="hairColor"
							value={resident.hairColor || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
				</div>

				<div className="mt-4">
					<label className="block text-sm font-medium mb-1">Diagnosis</label>
					<textarea
						name="diagnosis"
						value={resident.diagnosis || ''}
						onChange={handleChange}
						rows={3}
						className="w-full border rounded px-3 py-2"
					/>
				</div>
			</div>

			{/* Funding & Case Management */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Funding & Case Management</h2>
				<div className="grid grid-cols-2 gap-4">
					<div>
						<label className="block text-sm font-medium mb-1">
							Funding Agency
						</label>
						<input
							type="text"
							name="fundingAgency"
							value={resident.fundingAgency || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Support Broker
						</label>
						<input
							type="text"
							name="supportBroker"
							value={resident.supportBroker || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Case Manager Name
						</label>
						<input
							type="text"
							name="caseManagerName"
							value={resident.caseManagerName || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Case Manager Phone
						</label>
						<input
							type="tel"
							name="caseManagerPhone"
							value={resident.caseManagerPhone || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div className="col-span-2">
						<label className="block text-sm font-medium mb-1">
							Case Manager Email
						</label>
						<input
							type="email"
							name="caseManagerEmail"
							value={resident.caseManagerEmail || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
				</div>
			</div>

			{/* Vocational Agency */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Vocational Agency</h2>
				<div className="space-y-4">
					<div>
						<label className="block text-sm font-medium mb-1">
							Agency Name
						</label>
						<input
							type="text"
							name="vocationalAgency"
							value={resident.vocationalAgency || ''}
							onChange={handleChange}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium mb-1">
							Agency Address
						</label>
						<textarea
							name="vocationalAgencyAddress"
							value={resident.vocationalAgencyAddress || ''}
							onChange={handleChange}
							rows={3}
							className="w-full border rounded px-3 py-2"
						/>
					</div>
				</div>
			</div>

			{/* Important Relationships */}
			<div className="bg-white rounded-lg shadow p-6">
				<h2 className="text-xl font-bold mb-4">Important Relationships</h2>
				<textarea
					name="importantRelationships"
					value={resident.importantRelationships || ''}
					onChange={handleChange}
					rows={4}
					className="w-full border rounded px-3 py-2"
					placeholder="Document important relationships, contacts, and support network..."
				/>
			</div>

			{/* Save Button */}
			<div className="flex justify-end">
				<button
					onClick={handleSave}
					disabled={saving}
					className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
					{saving ? 'Saving...' : 'Save Changes'}
				</button>
			</div>
		</div>
	);
}
