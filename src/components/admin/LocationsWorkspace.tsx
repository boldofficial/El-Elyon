// src/components/admin/LocationsWorkspace.tsx

'use client';

import React, {useState, useEffect, useCallback} from 'react';
import {toast} from 'sonner';

interface Location {
	id: string; // Changed from _id to id
	name: string;
	address?: string;
	phone?: string; // Added phone field
	capacity?: number;
	status: 'active' | 'inactive';
}

export default function LocationsWorkspace() {
	const [locations, setLocations] = useState<Location[]>([]);
	const [deletingLocation, setDeletingLocation] = useState<string | null>(null);
	const [isSyncing, setIsSyncing] = useState(false);
	const [loading, setLoading] = useState(true);
	const [showForm, setShowForm] = useState(false); // To show/hide the form
	const [editingLocationData, setEditingLocationData] =
		useState<Location | null>(null); // Data for location being edited or created

	const fetchLocations = useCallback(async () => {
		setLoading(true);
		try {
			const res = await fetch('/api/admin/locations');
			if (!res.ok) {
				throw new Error(`HTTP error! status: ${res.status}`);
			}
			const data: Location[] = await res.json();
			setLocations(data);
		} catch (error: any) {
			console.error('Error fetching locations:', error);
			toast.error('Failed to load locations.');
			setLocations([]);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void fetchLocations();
	}, [fetchLocations]);

	async function handleSyncLocations() {
		setIsSyncing(true);
		try {
			// The API route /api/admin/locations/sync is expected to handle the logic
			// of finding existing location strings and creating new location records.
			const res = await fetch('/api/admin/locations/sync', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({}), // No specific body needed, backend handles logic
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to sync locations');
			}

			toast.success('Locations synced successfully!');
			await fetchLocations(); // Refresh locations list
		} catch (error: any) {
			toast.error(
				'Failed to sync locations: ' + (error.message || 'Unknown error')
			);
		} finally {
			setIsSyncing(false);
		}
	}

	const handleCreate = () => {
		setEditingLocationData({
			id: '',
			name: '',
			address: '',
			phone: '',
			capacity: 0,
			status: 'active',
		});
		setShowForm(true);
	};

	const handleEdit = (location: Location) => {
		setEditingLocationData(location);
		setShowForm(true);
	};

	const handleSave = async (data: Partial<Location>) => {
		try {
			if (editingLocationData?.id) {
				// Update existing
				const res = await fetch(
					`/api/admin/locations/${editingLocationData.id}`,
					{
						method: 'PATCH',
						headers: {'Content-Type': 'application/json'},
						body: JSON.stringify(data),
					}
				);
				if (!res.ok) throw new Error('Failed to update');
				toast.success('Location updated successfully');
			} else {
				// Create new
				const res = await fetch('/api/admin/locations', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify(data),
				});
				if (!res.ok) throw new Error('Failed to create');
				toast.success('Location created successfully');
			}

			setShowForm(false);
			setEditingLocationData(null);
			await fetchLocations(); // Refresh locations list
		} catch (error: any) {
			console.error('Error saving location:', error);
			toast.error('Failed to save location');
		}
	};

	const handleDeleteLocation = async (locationId: string) => {
		// Renamed from handleDelete to handleDeleteLocation
		if (!confirm('Are you sure you want to delete this location?')) return;

		setDeletingLocation(locationId); // Keep deleting state for UI feedback
		try {
			const res = await fetch(`/api/admin/locations/${locationId}`, {
				// Use RESTful endpoint
				method: 'DELETE',
			});
			if (!res.ok) throw new Error('Failed to delete');

			toast.success('Location deleted successfully');
			await fetchLocations(); // Refresh locations list
		} catch (error: any) {
			console.error('Error deleting location:', error);
			toast.error('Failed to delete location');
		} finally {
			setDeletingLocation(null);
		}
	};

	const getStatusColor = (status: string) => {
		return status === 'active'
			? 'bg-green-100 text-green-800'
			: 'bg-gray-100 text-gray-800';
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading locations...</p>
				</div>
			</div>
		);
	}

	if (showForm) {
		return (
			<LocationForm
				location={editingLocationData!}
				onSave={handleSave}
				onCancel={() => {
					setShowForm(false);
					setEditingLocationData(null);
				}}
			/>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold">
					Locations ({locations.length})
				</h2>
				<div className="flex gap-2">
					{locations.length === 0 && (
						<button
							className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
							onClick={() => void handleSyncLocations()}
							disabled={isSyncing}>
							{isSyncing ? 'Syncing...' : '🔄 Sync Existing Locations'}
						</button>
					)}
					<button
						className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
						onClick={handleCreate}>
						+ Add Location
					</button>
				</div>
			</div>

			{/* Migration Notice */}
			{locations.length === 0 && (
				<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
					<div className="flex items-start">
						<div className="shrink-0">
							<svg
								className="h-5 w-5 text-blue-400"
								viewBox="0 0 20 20"
								fill="currentColor">
								<path
									fillRule="evenodd"
									d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
									clipRule="evenodd"
								/>
							</svg>
						</div>
						<div className="ml-3 flex-1">
							<h3 className="text-sm font-medium text-blue-800">
								No locations found in the locations table
							</h3>
							<div className="mt-2 text-sm text-blue-700">
								<p>
									It looks like you have locations stored as strings in your
									residents, employees, and other tables, but they haven&quot;t
									been synced to the new locations management system yet.
								</p>
								<p className="mt-2">
									Click the <strong>&quot;Sync Existing Locations&quot;</strong>{' '}
									button above to automatically import all existing location
									&quot;trings into the locations table. This will allow you to
									manage them centrally with addresses, ca&quot;acity, and
									status information.
								</p>
							</div>
						</div>
					</div>
				</div>
			)}

			{/* Locations List */}
			<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
				<div className="px-6 py-4 border-b border-gray-200">
					<h3 className="text-lg font-semibold">All Locations</h3>
				</div>
				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-gray-200">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Name
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Address
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Phone
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Capacity
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Status
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Actions
								</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{locations.length === 0 ? (
								<tr>
									<td
										colSpan={6}
										className="px-6 py-8 text-center text-gray-500">
										<div className="text-4xl mb-2">📍</div>
										<p className="text-lg font-medium mb-1">No locations yet</p>
										<p className="text-sm">
											Sync existing locations or add your first location to get
											started
										</p>
									</td>
								</tr>
							) : (
								locations.map((location: Location) => (
									<tr key={location.id}>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm font-medium text-gray-900">
												{location.name}
											</div>
										</td>
										<td className="px-6 py-4">
											<div className="text-sm text-gray-500">
												{location.address || '—'}
											</div>
										</td>
										<td className="px-6 py-4 text-sm text-gray-600">
											{location.phone || '-'}
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div className="text-sm text-gray-500">
												{location.capacity || '—'}
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<span
												className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(location.status)}`}>
												{location.status}
											</span>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm">
											<button
												onClick={() => handleEdit(location)}
												className="text-blue-600 hover:text-blue-800 mr-3">
												Edit
											</button>
											<button
												onClick={() => void handleDeleteLocation(location.id)}
												disabled={deletingLocation === location.id}
												className="text-red-600 hover:text-red-800 disabled:opacity-50">
												{deletingLocation === location.id
													? 'Deleting...'
													: 'Delete'}
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

// LocationForm component moved from LocationManagement.tsx
function LocationForm({
	location,
	onSave,
	onCancel,
}: {
	location: Location;
	onSave: (data: Partial<Location>) => void;
	onCancel: () => void;
}) {
	const [formData, setFormData] = useState(location);

	const handleChange = (
		e: React.ChangeEvent<
			HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
		>
	) => {
		const {name, value, type} = e.target;
		setFormData((prev) => ({
			...prev,
			[name]: type === 'number' ? parseInt(value) || 0 : value,
		}));
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		onSave(formData);
	};

	return (
		<div className="bg-white rounded-lg shadow p-6">
			<h2 className="text-xl font-bold mb-6">
				{location.id ? 'Edit Location' : 'New Location'}
			</h2>

			<form onSubmit={handleSubmit} className="space-y-4">
				<div>
					<label className="block text-sm font-medium mb-1">
						Name <span className="text-red-500">*</span>
					</label>
					<input
						type="text"
						name="name"
						value={formData.name}
						onChange={handleChange}
						required
						className="w-full border rounded px-3 py-2"
					/>
				</div>

				<div>
					<label className="block text-sm font-medium mb-1">Address</label>
					<textarea
						name="address"
						value={formData.address || ''}
						onChange={handleChange}
						rows={3}
						className="w-full border rounded px-3 py-2"
					/>
				</div>

				<div>
					<label className="block text-sm font-medium mb-1">Phone</label>
					<input
						type="tel"
						name="phone"
						value={formData.phone || ''}
						onChange={handleChange}
						className="w-full border rounded px-3 py-2"
					/>
				</div>

				<div>
					<label className="block text-sm font-medium mb-1">Capacity</label>
					<input
						type="number"
						name="capacity"
						value={formData.capacity || 0}
						onChange={handleChange}
						className="w-full border rounded px-3 py-2"
					/>
				</div>

				<div>
					<label className="block text-sm font-medium mb-1">Status</label>
					<select
						id="status"
						title="Status"
						name="status"
						value={formData.status || 'active'}
						onChange={handleChange}
						className="w-full border rounded px-3 py-2">
						<option value="active">Active</option>
						<option value="inactive">Inactive</option>
					</select>
				</div>

				<div className="flex justify-end gap-3 pt-4 border-t">
					<button
						type="button"
						onClick={onCancel}
						className="px-6 py-2 border rounded hover:bg-gray-50">
						Cancel
					</button>
					<button
						type="submit"
						className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">
						Save
					</button>
				</div>
			</form>
		</div>
	);
}
