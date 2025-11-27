// src/components/workspaces/GuardiansWorkspace.tsx
'use client';

import React, {useState, useEffect} from 'react';
import GuardianOnboardingForm from '../guardian/GuardianOnboardingForm';
import {toast} from 'sonner';

interface Guardian {
	id: string;
	name: string;
	email: string;
	phone: string;
	relationship?: string;
	address?: string;
	residentIds: string[];
	residentNames: string[];
	preferredChannel: string;
	createdAt: string;
	createdBy: string;
}

interface Resident {
	id: string;
	name: string;
	location: string;
}

interface CurrentUser {
	role: string;
}

export default function GuardiansWorkspace() {
	const [showOnboardingForm, setShowOnboardingForm] = useState(false);
	const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
	const [searchTerm, setSearchTerm] = useState('');
	const [filterResident, setFilterResident] = useState<string>('');

	const [guardians, setGuardians] = useState<Guardian[]>([]);
	const [residents, setResidents] = useState<Resident[]>([]);
	const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
	const [loading, setLoading] = useState(true);

	const isAdmin = currentUser?.role === 'admin';

	useEffect(() => {
		fetchGuardians();
		fetchResidents();
		fetchCurrentUser();
	}, []);

	const fetchGuardians = async () => {
		try {
			const res = await fetch('/api/guardians');
			if (!res.ok) throw new Error('Failed to fetch guardians');
			const data = await res.json();
			setGuardians(data);
		} catch (error: any) {
			toast.error(error.message);
		} finally {
			setLoading(false);
		}
	};

	const fetchResidents = async () => {
		try {
			const res = await fetch('/api/residents');
			if (!res.ok) throw new Error('Failed to fetch residents');
			const data = await res.json();
			setResidents(data);
		} catch (error: any) {
			toast.error(error.message);
		}
	};

	const fetchCurrentUser = async () => {
		try {
			const res = await fetch('/api/users/current');
			if (!res.ok) throw new Error('Failed to fetch current user');
			const data = await res.json();
			setCurrentUser(data);
		} catch (error: any) {
			toast.error(error.message);
		}
	};

	// Filter guardians
	const filteredGuardians = guardians.filter((guardian) => {
		const matchesSearch =
			guardian.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			guardian.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
			guardian.phone.includes(searchTerm);

		const matchesResident =
			!filterResident || guardian.residentIds?.includes(filterResident);

		return matchesSearch && matchesResident;
	});

	const handleEdit = (guardian: Guardian) => {
		setEditingGuardian(guardian);
		setShowOnboardingForm(false);
	};

	const handleDelete = async (guardianId: string) => {
		if (
			!confirm(
				'Are you sure you want to delete this guardian? This action cannot be undone.'
			)
		) {
			return;
		}

		try {
			const res = await fetch(`/api/guardians/${guardianId}`, {
				method: 'DELETE',
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to delete guardian');
			}

			toast.success('Guardian deleted successfully');
			fetchGuardians();
		} catch (error: any) {
			toast.error(error.message || 'Failed to delete guardian');
		}
	};

	const handleSaveEdit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingGuardian) return;

		try {
			const res = await fetch(`/api/guardians/${editingGuardian.id}`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					name: editingGuardian.name,
					email: editingGuardian.email,
					phone: editingGuardian.phone,
					relationship: editingGuardian.relationship,
					address: editingGuardian.address,
					residentIds: editingGuardian.residentIds,
				}),
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to update guardian');
			}

			toast.success('Guardian updated successfully');
			setEditingGuardian(null);
			fetchGuardians();
		} catch (error: any) {
			toast.error(error.message || 'Failed to update guardian');
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex justify-between items-center">
				<h3 className="text-xl font-semibold">Guardian Management</h3>
				<button
					onClick={() => {
						setShowOnboardingForm(!showOnboardingForm);
						setEditingGuardian(null);
					}}
					className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700">
					{showOnboardingForm ? 'Cancel' : 'Add New Guardian'}
				</button>
			</div>

			{/* Search and Filter */}
			<div className="bg-white rounded-lg shadow-sm border p-4">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Search Guardians
						</label>
						<input
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search by name, email, or phone..."
							className="w-full border border-gray-300 rounded-md px-3 py-2"
						/>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Filter by Resident
						</label>
						<select
						  name="resident"
							title="Resident"
							value={filterResident}
							onChange={(e) => setFilterResident(e.target.value)}
							className="w-full border border-gray-300 rounded-md px-3 py-2">
							<option value="">All Residents</option>
							{residents.map((resident) => (
								<option key={resident.id} value={resident.id}>
									{resident.name}
								</option>
							))}
						</select>
					</div>
				</div>
				<div className="mt-2 text-sm text-gray-600">
					Showing {filteredGuardians.length} of {guardians.length} guardians
				</div>
			</div>

			{/* Onboarding Form */}
			{showOnboardingForm && (
				<GuardianOnboardingForm
					onCreated={() => {
						setShowOnboardingForm(false);
						fetchGuardians();
					}}
				/>
			)}

			{/* Edit Form */}
			{editingGuardian && (
				<div className="bg-white rounded-lg shadow-sm border p-6">
					<h4 className="text-lg font-semibold mb-4">Edit Guardian</h4>
					<form onSubmit={handleSaveEdit} className="space-y-4">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									Name <span className="text-red-500">*</span>
								</label>
								<input
									type="text"
									value={editingGuardian.name}
									onChange={(e) =>
										setEditingGuardian({
											...editingGuardian,
											name: e.target.value,
										})
									}
									className="w-full border border-gray-300 rounded-md px-3 py-2"
									required
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									Relationship
								</label>
								<input
									type="text"
									value={editingGuardian.relationship || ''}
									onChange={(e) =>
										setEditingGuardian({
											...editingGuardian,
											relationship: e.target.value,
										})
									}
									className="w-full border border-gray-300 rounded-md px-3 py-2"
									placeholder="e.g., Parent, Sibling, Legal Guardian"
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									Email <span className="text-red-500">*</span>
								</label>
								<input
									type="email"
									value={editingGuardian.email}
									onChange={(e) =>
										setEditingGuardian({
											...editingGuardian,
											email: e.target.value,
										})
									}
									className="w-full border border-gray-300 rounded-md px-3 py-2"
									required
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									Phone <span className="text-red-500">*</span>
								</label>
								<input
									type="tel"
									value={editingGuardian.phone}
									onChange={(e) =>
										setEditingGuardian({
											...editingGuardian,
											phone: e.target.value,
										})
									}
									className="w-full border border-gray-300 rounded-md px-3 py-2"
									required
								/>
							</div>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Address
							</label>
							<input
								type="text"
								value={editingGuardian.address || ''}
								onChange={(e) =>
									setEditingGuardian({
										...editingGuardian,
										address: e.target.value,
									})
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								placeholder="Street address"
							/>
						</div>

						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Associated Residents <span className="text-red-500">*</span>
							</label>
							<div className="border border-gray-300 rounded-md p-3 max-h-48 overflow-y-auto">
								{residents.map((resident) => (
									<label key={resident.id} className="flex items-center mb-2">
										<input
											type="checkbox"
											checked={editingGuardian.residentIds?.includes(
												resident.id
											)}
											onChange={(e) => {
												const newResidentIds = e.target.checked
													? [
															...(editingGuardian.residentIds || []),
															resident.id,
														]
													: editingGuardian.residentIds.filter(
															(id) => id !== resident.id
														);
												setEditingGuardian({
													...editingGuardian,
													residentIds: newResidentIds,
												});
											}}
											className="mr-2"
										/>
										<span className="text-sm">
											{resident.name} ({resident.location})
										</span>
									</label>
								))}
							</div>
						</div>

						<div className="flex gap-2">
							<button
								type="submit"
								className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
								Save Changes
							</button>
							<button
								type="button"
								onClick={() => setEditingGuardian(null)}
								className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Guardians List */}
			<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
				<div className="px-6 py-4 border-b border-gray-200">
					<h4 className="text-lg font-semibold">Current Guardians</h4>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-gray-200">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Name
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Relationship
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Contact Info
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Residents
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Created
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Actions
								</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{filteredGuardians.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-6 py-4 text-center text-gray-500">
										{searchTerm || filterResident
											? 'No guardians match your filters.'
											: 'No guardians found. Add your first guardian using the form above.'}
									</td>
								</tr>
							) : (
								filteredGuardians.map((guardian) => (
									<tr key={guardian.id} className="hover:bg-gray-50">
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm font-medium text-gray-900">
												{guardian.name}
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm text-gray-900">
												{guardian.relationship || 'Not specified'}
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm text-gray-900">
												{guardian.email && <div>📧 {guardian.email}</div>}
												{guardian.phone && <div>📞 {guardian.phone}</div>}
											</div>
										</td>
										<td className="px-6 py-4">
											<div className="text-sm text-gray-900">
												{guardian.residentNames &&
												guardian.residentNames.length > 0 ? (
													<div className="flex flex-wrap gap-1">
														{guardian.residentNames.map((name, idx) => (
															<span
																key={idx}
																className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
																{name}
															</span>
														))}
													</div>
												) : (
													<span className="text-gray-400">None</span>
												)}
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm text-gray-900">
												{guardian.createdAt
													? new Date(guardian.createdAt).toLocaleDateString()
													: 'Unknown'}
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm">
											<div className="flex gap-2">
												<button
													onClick={() => handleEdit(guardian)}
													className="text-blue-600 hover:text-blue-800 font-medium">
													Edit
												</button>
												{isAdmin && (
													<button
														onClick={() => handleDelete(guardian.id)}
														className="text-red-600 hover:text-red-800 font-medium">
														Delete
													</button>
												)}
											</div>
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
