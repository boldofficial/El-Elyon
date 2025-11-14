/* eslint-disable @typescript-eslint/no-misused-promises */
import React, {useState} from 'react';
import {useQuery, useMutation} from 'convex/react';
import {api} from '../../convex/_generated/api';
import {Id} from '../../convex/_generated/dataModel';
import GuardianOnboardingForm from './GuardianOnboardingForm';
import {toast} from 'sonner';

export default function GuardiansWorkspace() {
	const [showOnboardingForm, setShowOnboardingForm] = useState(false);
	const [editingGuardian, setEditingGuardian] = useState<any>(null);
	const [searchTerm, setSearchTerm] = useState('');
	const [filterResident, setFilterResident] = useState<string>('');

	const currentUser = useQuery(api.users.getCurrentUser);
	const isAdmin = currentUser?.role === 'admin';

	const guardians = useQuery(api.people.listGuardians) || [];
	const residents = useQuery(api.people.listResidents) || [];

	const updateGuardian = useMutation(api.people.updateGuardian);
	const deleteGuardian = useMutation(api.people.deleteGuardian);

	// Filter guardians
	const filteredGuardians = guardians.filter((guardian: any) => {
		const matchesSearch =
			guardian.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
			guardian.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
			guardian.phone.includes(searchTerm);

		const matchesResident =
			!filterResident || guardian.residentIds?.includes(filterResident);

		return matchesSearch && matchesResident;
	});

	const handleEdit = (guardian: any) => {
		setEditingGuardian(guardian);
		setShowOnboardingForm(false);
	};

	const handleDelete = async (guardianId: Id<'guardians'>) => {
		if (
			!confirm(
				'Are you sure you want to delete this guardian? This action cannot be undone.'
			)
		) {
			return;
		}

		try {
			await deleteGuardian({guardianId});
			toast.success('Guardian deleted successfully');
		} catch (error: any) {
			toast.error(error.message || 'Failed to delete guardian');
		}
	};

	const handleSaveEdit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingGuardian) return;

		try {
			await updateGuardian({
				guardianId: editingGuardian.id,
				name: editingGuardian.name,
				email: editingGuardian.email,
				phone: editingGuardian.phone,
				relationship: editingGuardian.relationship,
				address: editingGuardian.address,
				residentIds: editingGuardian.residentIds,
			});
			toast.success('Guardian updated successfully');
			setEditingGuardian(null);
		} catch (error: any) {
			toast.error(error.message || 'Failed to update guardian');
		}
	};

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
							value={filterResident}
							onChange={(e) => setFilterResident(e.target.value)}
							className="w-full border border-gray-300 rounded-md px-3 py-2">
							<option value="">All Residents</option>
							{residents.map((resident: any) => (
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
								{residents.map((resident: any) => (
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
															(id: string) => id !== resident.id
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
								filteredGuardians.map((guardian: any) => (
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
														{guardian.residentNames.map(
															(name: string, idx: number) => (
																<span
																	key={idx}
																	className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
																	{name}
																</span>
															)
														)}
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
