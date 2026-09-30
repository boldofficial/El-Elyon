// src/components/care/ResidentsWorkspace.tsx

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';
import ResidentOnboardingForm from './ResidentOnboardingForm';
import ResidentCase from './ResidentCase';
import {
	residentStatusBadge,
	residentStatusDetail,
	type ResidentStatusTone,
} from '@/lib/resident-status';

const STATUS_BADGE_STYLES: Record<ResidentStatusTone, string> = {
	active: 'bg-green-100 text-green-800 ring-green-600/20 hover:bg-green-200',
	deceased: 'bg-gray-800 text-white ring-gray-900/20 hover:bg-gray-700',
	terminated: 'bg-red-100 text-red-800 ring-red-600/20 hover:bg-red-200',
	discharged: 'bg-amber-100 text-amber-800 ring-amber-600/20 hover:bg-amber-200',
	inactive: 'bg-gray-100 text-gray-700 ring-gray-500/20 hover:bg-gray-200',
};

interface ResidentsWorkspaceProps {
	onNavigate?: (view: string, entityId: string) => void;
}

export default function ResidentsWorkspace({
	onNavigate,
}: ResidentsWorkspaceProps) {
	const [residents, setResidents] = useState<any[]>([]);
	const [userRole, setUserRole] = useState<any>(null);
	const [loadingData, setLoadingData] = useState(true);
	const [errorData, setErrorData] = useState<string | null>(null);
	const [showAddForm, setShowAddForm] = useState(false);
	const [selectedResident, setSelectedResident] = useState<string | null>(null);
	const [searchTerm, setSearchTerm] = useState('');
	const [locationFilter, setLocationFilter] = useState('all');
	const [statusFilter, setStatusFilter] = useState<'all' | ResidentStatusTone>(
		'all'
	);
	// Resident whose status badge was clicked to reveal its date.
	const [openStatusId, setOpenStatusId] = useState<string | null>(null);

	const fetchResidentsAndRole = async () => {
		setLoadingData(true);
		setErrorData(null);
		try {
			const [residentsRes, userRoleRes] = await Promise.all([
				fetch('/api/residents'),
				fetch('/api/users/role'),
			]);

			if (!residentsRes.ok) throw new Error('Failed to fetch residents');
			if (!userRoleRes.ok) throw new Error('Failed to fetch user role');

			const residentsData = await residentsRes.json();
			const userRoleData = await userRoleRes.json();

			setResidents(residentsData);
			setUserRole(userRoleData);
		} catch (e: any) {
			console.error('Error fetching initial data:', e);
			setErrorData(e.message || 'Failed to load initial data.');
		} finally {
			setLoadingData(false);
		}
	};

	useEffect(() => {
		fetchResidentsAndRole();
	}, []);

	// Get unique locations for filter
	const locations = [...new Set(residents.map((r) => r.location))];

	// Filter residents
	const filteredResidents = residents.filter((resident) => {
		const matchesSearch = resident.name
			.toLowerCase()
			.includes(searchTerm.toLowerCase());
		const matchesLocation =
			locationFilter === 'all' || resident.location === locationFilter;
		const matchesStatus =
			statusFilter === 'all' ||
			residentStatusBadge(resident).tone === statusFilter;
		return matchesSearch && matchesLocation && matchesStatus;
	});

	async function handleDeleteResident(residentId: string) {
		if (
			!window.confirm(
				'Are you sure you want to delete this resident? This action cannot be undone.'
			)
		) {
			return;
		}

		try {
			const res = await fetch(`/api/people/${residentId}`, {
				method: 'DELETE',
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to delete resident');
			}
			toast.success('Resident deleted successfully');
			if (selectedResident === residentId) {
				setSelectedResident(null);
			}
			await fetchResidentsAndRole(); // Refresh the list
		} catch (error: any) {
			toast.error(error.message || 'Failed to delete resident');
		}
	}

	const canDelete = userRole?.role === 'admin';

	if (loadingData) return <div>Loading residents...</div>;
	if (errorData) return <div className="text-red-600">{errorData}</div>;

	if (selectedResident) {
		const resident = residents.find((r) => r.id === selectedResident);
		if (!resident) {
			setSelectedResident(null);
			return null;
		}

		return (
			<ResidentCase
				residentId={resident.id}
				onBack={() => setSelectedResident(null)}
			/>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold">
					Residents ({filteredResidents.length})
				</h2>
				<button
					className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
					onClick={() => setShowAddForm(!showAddForm)}>
					{showAddForm ? 'Cancel' : 'Add Resident'}
				</button>
			</div>

			{/* Search and Filter */}
			<div className="bg-white rounded-lg shadow-sm border p-4">
				<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
					<div>
						<label
							htmlFor="searchResidents"
							className="block text-sm font-medium text-gray-700 mb-2">
							Search Residents
						</label>
						<input
							id="searchResidents"
							type="text"
							value={searchTerm}
							onChange={(e) => setSearchTerm(e.target.value)}
							placeholder="Search by name..."
							className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
							aria-label="Search Residents by name"
						/>
					</div>
					<div>
						<label
							htmlFor="locationFilter"
							className="block text-sm font-medium text-gray-700 mb-2">
							Filter by Location
						</label>
						<select
							id="locationFilter"
							value={locationFilter}
							onChange={(e) => setLocationFilter(e.target.value)}
							className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
							aria-label="Filter Residents by Location">
							<option value="all">All Locations</option>
							{locations.map((location) => (
								<option key={location} value={location}>
									{location}
								</option>
							))}
						</select>
					</div>
					<div>
						<label
							htmlFor="statusFilter"
							className="block text-sm font-medium text-gray-700 mb-2">
							Filter by Status
						</label>
						<select
							id="statusFilter"
							value={statusFilter}
							onChange={(e) =>
								setStatusFilter(e.target.value as 'all' | ResidentStatusTone)
							}
							className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
							aria-label="Filter Residents by Status">
							<option value="all">All Statuses</option>
							<option value="active">Active</option>
							<option value="deceased">Deceased</option>
							<option value="terminated">Terminated</option>
							<option value="discharged">Discharged</option>
							<option value="inactive">Inactive (no reason set)</option>
						</select>
					</div>
				</div>
			</div>

			{/* Add Resident Form */}
			{showAddForm && (
				<ResidentOnboardingForm
					onCreated={() => {
						setShowAddForm(false);
						fetchResidentsAndRole(); // Refresh residents list after creation
					}}
				/>
			)}

			{/* Residents List */}
			<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
				<div className="px-6 py-4 border-b border-gray-200">
					<h3 className="text-lg font-semibold">Resident Directory</h3>
				</div>

				{filteredResidents.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						<div className="text-4xl mb-4">🏠</div>
						<p className="text-lg font-medium mb-2">
							{searchTerm || locationFilter !== 'all' || statusFilter !== 'all'
								? 'No residents match your filters'
								: 'No residents yet'}
						</p>
						<p className="text-sm">
							{searchTerm || locationFilter !== 'all' || statusFilter !== 'all'
								? 'Try adjusting your search or filters'
								: 'Add your first resident to get started'}
						</p>
					</div>
				) : (
					<div className="divide-y divide-gray-200">
						{filteredResidents.map((resident) => (
							<div
								key={resident.id}
								className="p-6 hover:bg-gray-50 transition-colors">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<div className="flex flex-wrap items-center gap-3 mb-2">
											<h4 className="text-lg font-medium text-gray-900">
												{resident.name}
											</h4>
											{(() => {
												const badge = residentStatusBadge(resident);
												const isOpen = openStatusId === resident.id;
												return (
													<button
														type="button"
														onClick={() =>
															setOpenStatusId(isOpen ? null : resident.id)
														}
														aria-expanded={isOpen}
														aria-controls={`resident-status-${resident.id}`}
														title="Show status date"
														className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset transition-colors ${STATUS_BADGE_STYLES[badge.tone]}`}>
														{badge.label}
													</button>
												);
											})()}
											<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
												{resident.location}
											</span>
										</div>
										{openStatusId === resident.id && (
											<p
												id={`resident-status-${resident.id}`}
												className="mb-2 inline-block rounded-md bg-gray-100 px-3 py-1 text-sm text-gray-800">
												{residentStatusDetail(resident)}
											</p>
										)}

										<div className="text-sm text-gray-600 space-y-1">
											<div>
												<span className="font-medium">Date of Birth:</span>{' '}
												{resident.dateOfBirth}
											</div>
											<div>
												<span className="font-medium">Added:</span>{' '}
												{resident.createdAt
													? new Date(resident.createdAt).toLocaleDateString()
													: 'Unknown'}
											</div>
										</div>
									</div>

									<div className="flex flex-col items-end space-y-2">
										<button
											onClick={() => setSelectedResident(resident.id)}
											className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
											aria-label={`View details for ${resident.name}`}>
											View Details
										</button>

										{/* NEW: Full Profile Button */}
										{onNavigate && (
											<button
												onClick={() =>
													onNavigate('resident-profile', resident.id)
												}
												className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
												aria-label={`View full profile for ${resident.name}`}>
												👤 Full Profile
											</button>
										)}

										{canDelete && (
											<button
												onClick={() => handleDeleteResident(resident.id)}
												className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
												aria-label={`Delete ${resident.name}`}>
												Delete
											</button>
										)}
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
