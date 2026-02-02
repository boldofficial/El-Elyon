import React, {useState, useMemo, useEffect} from 'react';
import {toast} from 'sonner';
import FireEvacManagement from '../admin/FireEvacManagement';
import ISPWorkspace from '../admin/ISPWorkspace';

type StatusType = 'ok' | 'due-soon' | 'overdue';

const STATUS_COLORS: Record<StatusType, string> = {
	ok: 'text-green-600 bg-green-50',
	'due-soon': 'text-orange-600 bg-orange-50',
	overdue: 'text-red-600 bg-red-50',
};

const STATUS_ORDER: Record<StatusType, number> = {
	overdue: 0,
	'due-soon': 1,
	ok: 2,
};

export default function ComplianceWorkspace() {
	const [filters, setFilters] = useState({
		location: '',
		itemType: '',
		status: '',
	});
	const [selectedItems, setSelectedItems] = useState<string[]>([]);
	const [showISPWorkspace, setShowISPWorkspace] = useState<{
		residentId: string;
		residentName: string;
	} | null>(null);
	const [showFireEvacManagement, setShowFireEvacManagement] = useState<{
		residentId: string;
		residentName: string;
	} | null>(null);

	// State for data
	const [userRole, setUserRole] = useState<any>(null);
	const [complianceData, setComplianceData] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isFetching, setIsFetching] = useState(true);

	// Fetch user role
	const fetchUserRole = async () => {
		try {
			const response = await fetch('/api/users/role');
			if (!response.ok) throw new Error('Failed to fetch user role');
			const data = await response.json();
			setUserRole(data);
		} catch (error: any) {
			console.error('Error fetching user role:', error);
			toast.error(error.message || 'Failed to fetch user role');
		}
	};

	// Fetch compliance overview
	const fetchComplianceOverview = async () => {
		setIsFetching(true);
		try {
			const response = await fetch('/api/admin/compliance/overview');
			if (!response.ok) throw new Error('Failed to fetch compliance overview');
			const data = await response.json();
			setComplianceData(data);
		} catch (error: any) {
			console.error('Error fetching compliance overview:', error);
			toast.error(error.message || 'Failed to fetch compliance overview');
		} finally {
			setIsFetching(false);
		}
	};

	// Initial load
	useEffect(() => {
		fetchUserRole();
		fetchComplianceOverview();
	}, []);

	// Get unique locations for filter - only show locations user has access to
	const locations = useMemo(() => {
		const allLocations = complianceData.map((item) => item.location);
		const uniqueLocations = [...new Set(allLocations)].sort();

		// If user is not admin, filter to only their assigned locations
		if (userRole && userRole.role !== 'admin' && userRole.locations) {
			return uniqueLocations.filter((loc) => userRole.locations?.includes(loc));
		}

		return uniqueLocations;
	}, [complianceData, userRole]);

	const handleBulkAction = async (action: string) => {
		if (selectedItems.length === 0) return;
		setIsLoading(true);
		try {
			if (action === 'send-reminders') {
				const response = await fetch('/api/admin/compliance/send-reminders', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({itemIds: selectedItems}),
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || 'Failed to send reminders');
				}

				toast.success(`Reminders sent for ${selectedItems.length} items`);
			} else if (action === 'export') {
				const response = await fetch('/api/admin/compliance/export-list', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({itemIds: selectedItems}),
				});

				if (!response.ok) {
					const error = await response.json();
					throw new Error(error.error || 'Failed to export list');
				}

				toast.success(`Exported ${selectedItems.length} items`);
			}
			setSelectedItems([]);
		} catch (error: any) {
			console.error('Bulk action failed:', error);
			toast.error(error.message || 'Action failed. Please try again.');
		} finally {
			setIsLoading(false);
		}
	};

	const filteredComplianceData = useMemo(() => {
		return complianceData
			.filter((item) => {
				if (filters.location && item.location !== filters.location)
					return false;
				if (filters.itemType && item.type !== filters.itemType) return false;
				if (filters.status && item.status !== filters.status) return false;
				return true;
			})
			.sort(
				(a, b) =>
					STATUS_ORDER[a.status as StatusType] -
					STATUS_ORDER[b.status as StatusType]
			);
	}, [complianceData, filters]);

	const renderOverview = () => (
		<div className="space-y-6">
			{/* Filters */}
			<div className="bg-white p-4 rounded-lg shadow-sm border">
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Location
						</label>
						<select
							id="location-filter"
							title="Select location"
							disabled={isFetching}
							value={filters.location}
							onChange={(e) =>
								setFilters({...filters, location: e.target.value})
							}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
							<option value="">All Locations</option>
							{locations.map((location) => (
								<option key={location} value={location}>
									{location}
								</option>
							))}
						</select>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Item Type
						</label>
						<select
							id="item-type-filter"
							title="Select item type"
							disabled={isFetching}
							value={filters.itemType}
							onChange={(e) =>
								setFilters({...filters, itemType: e.target.value})
							}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
							<option value="">All Types</option>
							<option value="isp">ISP</option>
							<option value="fire_evac">Fire Evac Plan</option>
						</select>
					</div>
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Status
						</label>
						<select
							id="status-filter"
							title="Select status"
							disabled={isFetching}
							value={filters.status}
							onChange={(e) => setFilters({...filters, status: e.target.value})}
							className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500">
							<option value="">All Statuses</option>
							<option value="overdue">Overdue</option>
							<option value="due-soon">Due Soon</option>
							<option value="ok">OK</option>
						</select>
					</div>
					<div className="flex items-end">
						<button
							onClick={() =>
								setFilters({location: '', itemType: '', status: ''})
							}
							className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
							Clear Filters
						</button>
					</div>
				</div>
			</div>

			{/* Bulk Actions */}
			{selectedItems.length > 0 && (
				<div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
					<div className="flex items-center justify-between">
						<span className="text-sm text-blue-700">
							{selectedItems.length} items selected
						</span>
						<div className="space-x-2">
							<button
								onClick={() => handleBulkAction('send-reminders')}
								disabled={isLoading}
								className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
								Send Reminders
							</button>
							<button
								onClick={() => handleBulkAction('export')}
								disabled={isLoading}
								className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50">
								Export List
							</button>
							<button
								onClick={() => setSelectedItems([])}
								disabled={isLoading}
								className="px-3 py-1 text-sm bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50">
								Clear Selection
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Compliance Items Table */}
			<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
				<div className="px-6 py-4 border-b border-gray-200">
					<h3 className="text-lg font-medium text-gray-900">
						Compliance Items
					</h3>
				</div>
				{isFetching ? (
					<div className="flex items-center justify-center p-8">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
						<span className="ml-2 text-gray-600">
							Loading compliance data...
						</span>
					</div>
				) : (
					<div className="overflow-x-auto">
						<table className="min-w-full divide-y divide-gray-200">
							<thead className="bg-gray-50">
								<tr>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
										<input
											type="checkbox"
											checked={
												selectedItems.length ===
													filteredComplianceData.length &&
												filteredComplianceData.length > 0
											}
											onChange={(e) => {
												if (e.target.checked) {
													setSelectedItems(
														filteredComplianceData.map((item) => item.id)
													);
												} else {
													setSelectedItems([]);
												}
											}}
											className="rounded border-gray-300"
										/>
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
										Item
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
										Location
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
										Status
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
										Due Date
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
										Last Action
									</th>
									<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
										Actions
									</th>
								</tr>
							</thead>
							<tbody className="bg-white divide-y divide-gray-200">
								{filteredComplianceData.map((item) => (
									<tr key={item.id} className="hover:bg-gray-50">
										<td className="px-6 py-4 whitespace-nowrap">
											<input
												type="checkbox"
												checked={selectedItems.includes(item.id)}
												onChange={(e) => {
													if (e.target.checked) {
														setSelectedItems([...selectedItems, item.id]);
													} else {
														setSelectedItems(
															selectedItems.filter((id) => id !== item.id)
														);
													}
												}}
												className="rounded border-gray-300"
											/>
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<div>
												<div className="text-sm font-medium text-gray-900">
													{item.itemName}
												</div>
												<div className="text-sm text-gray-500">
													{item.description}
												</div>
											</div>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
											{item.location}
										</td>
										<td className="px-6 py-4 whitespace-nowrap">
											<span
												className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${STATUS_COLORS[item.status as StatusType]}`}>
												{item.status === 'due-soon'
													? 'Due Soon'
													: item.status === 'overdue'
														? 'Overdue'
														: 'OK'}
											</span>
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
											{new Date(item.dueDate).toLocaleDateString()}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
											{item.lastAction}
										</td>
										<td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
											{item.type === 'isp' && item.residentId && (
												<button
													onClick={() =>
														setShowISPWorkspace({
															residentId: item.residentId,
															residentName:
																item.residentName || 'Unknown Resident',
														})
													}
													className="text-blue-600 hover:text-blue-900">
													Manage ISP
												</button>
											)}
											{item.type === 'fire_evac' && item.residentId && (
												<button
													onClick={() =>
														setShowFireEvacManagement({
															residentId: item.residentId,
															residentName:
																item.residentName || 'Unknown Resident',
														})
													}
													className="text-green-600 hover:text-green-900">
													Manage Fire Evac
												</button>
											)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{filteredComplianceData.length === 0 && (
							<div className="text-center py-8">
								<div className="text-4xl mb-4">📋</div>
								<p className="text-gray-500 text-lg font-medium mb-2">
									No compliance items found
								</p>
								<p className="text-gray-400 text-sm">
									{complianceData.length === 0
										? userRole?.role === 'admin'
											? 'No compliance items exist yet. Add residents and ISPs to get started.'
											: 'No compliance items for your assigned locations yet.'
										: 'Try adjusting your filters to see more items.'}
								</p>
							</div>
						)}
					</div>
				)}
			</div>
		</div>
	);

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold text-gray-900">
						Compliance Overview
					</h2>
					<p className="text-gray-600">
						Monitor compliance status for ISPs, fire evacuation, and more
					</p>
					{userRole &&
						userRole.locations &&
						userRole.locations.length > 0 &&
						userRole.role !== 'admin' && (
							<p className="text-sm text-blue-600 mt-1">
								📍 Viewing: {userRole.locations.join(', ')}
							</p>
						)}
				</div>
			</div>
			{renderOverview()}

			{/* ISP Workspace Modal */}
			{showISPWorkspace && (
				<>
					<div 
						className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm duration-200 ease-in-out" 
						onClick={() => setShowISPWorkspace(null)}
					/>
					<div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg duration-200 sm:rounded-xl">
						<ISPWorkspace
							residentId={showISPWorkspace.residentId}
							residentName={showISPWorkspace.residentName}
							onClose={() => setShowISPWorkspace(null)}
						/>
					</div>
				</>
			)}

			{showFireEvacManagement && (
				<>
					<div 
						className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm duration-200 ease-in-out"
						onClick={() => setShowFireEvacManagement(null)}
					/>
					<div className="fixed left-[50%] top-[50%] z-50 grid w-full max-w-4xl translate-x-[-50%] translate-y-[-50%] gap-4 border bg-white p-6 shadow-lg duration-200 sm:rounded-xl">
						<FireEvacManagement
							residentId={showFireEvacManagement.residentId}
							residentName={showFireEvacManagement.residentName}
							onClose={() => setShowFireEvacManagement(null)}
						/>
					</div>
				</>
			)}
		</div>
	);
}
