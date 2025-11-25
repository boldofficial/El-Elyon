import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

export default function ComplianceSettings() {
	// State
	const [overview, setOverview] = useState<any[]>([]);
	const [selectedIds, setSelectedIds] = useState<string[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [isFetching, setIsFetching] = useState(true);

	// Filters
	const [statusFilter, setStatusFilter] = useState<string>('all');
	const [typeFilter, setTypeFilter] = useState<string>('all');
	const [locationFilter, setLocationFilter] = useState<string>('all');

	// Fetch compliance overview
	const fetchOverview = async () => {
		setIsFetching(true);
		try {
			const response = await fetch('/api/admin/compliance/overview');
			if (!response.ok) throw new Error('Failed to fetch compliance overview');
			const data = await response.json();
			setOverview(data);
		} catch (error: any) {
			console.error('Error fetching overview:', error);
			toast.error(error.message || 'Failed to fetch compliance overview');
		} finally {
			setIsFetching(false);
		}
	};

	// Initial load
	useEffect(() => {
		fetchOverview();
	}, []);

	// Bulk actions
	const handleSelect = (id: string) => {
		setSelectedIds((ids) =>
			ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]
		);
	};

	const handleSelectAll = (items: any[]) => {
		if (selectedIds.length === items.length) setSelectedIds([]);
		else setSelectedIds(items.map((i) => i.id));
	};

	const handleSendReminders = async () => {
		if (selectedIds.length === 0) return;
		setIsLoading(true);
		try {
			const response = await fetch('/api/admin/compliance/send-reminders', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({itemIds: selectedIds}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to send reminders');
			}

			toast.success(
				`Compliance reminder emails are being sent to all admins and supervisors for ${selectedIds.length} item(s)!`
			);
			setSelectedIds([]);
		} catch (e: any) {
			toast.error(e.message || 'Failed to send reminders');
		} finally {
			setIsLoading(false);
		}
	};

	const handleExport = async () => {
		if (selectedIds.length === 0) return;
		setIsLoading(true);
		try {
			const response = await fetch('/api/admin/compliance/export-list', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({itemIds: selectedIds}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to export list');
			}

			toast.success('Exported compliance list!');
			setSelectedIds([]);
		} catch (e: any) {
			toast.error(e.message || 'Failed to export list');
		} finally {
			setIsLoading(false);
		}
	};

	// Status color
	const getStatusColor = (status: string) => {
		switch (status) {
			case 'ok':
				return 'bg-green-100 text-green-800';
			case 'due-soon':
				return 'bg-yellow-100 text-yellow-800';
			case 'overdue':
				return 'bg-red-100 text-red-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	};

	// Format date
	const formatDate = (date: number) => new Date(date).toLocaleDateString();

	// Filter overview items
	const filteredOverview = overview.filter((item: any) => {
		if (statusFilter !== 'all' && item.status !== statusFilter) return false;
		if (typeFilter !== 'all' && item.type !== typeFilter) return false;
		if (locationFilter !== 'all' && item.location !== locationFilter)
			return false;
		return true;
	});

	if (isFetching) {
		return (
			<div className="flex items-center justify-center p-8">
				<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
				<span className="ml-2 text-gray-600">
					Loading compliance settings...
				</span>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="border-b border-gray-200 pb-4">
				<h3 className="text-lg font-semibold">Compliance Overview</h3>
				<p className="text-sm text-gray-600 mt-1">
					Monitor and manage compliance items across all locations
				</p>
			</div>

			{/* Compliance Items */}
			<div className="space-y-4">
				<div className="flex justify-between items-center mb-4">
					<h3 className="text-lg font-semibold">Compliance Items</h3>
					<div className="flex gap-2">
						<button
							onClick={() => handleSelectAll(filteredOverview)}
							className="px-3 py-2 bg-gray-200 rounded hover:bg-gray-300 text-sm"
							disabled={isLoading}>
							{selectedIds.length === filteredOverview.length
								? 'Unselect All'
								: 'Select All'}
						</button>
						<button
							onClick={handleSendReminders}
							disabled={selectedIds.length === 0 || isLoading}
							className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm disabled:opacity-50 flex items-center gap-2">
							{isLoading && (
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
							)}
							Send Reminders
						</button>
						<button
							onClick={handleExport}
							disabled={selectedIds.length === 0 || isLoading}
							className="px-3 py-2 bg-green-600 text-white rounded hover:bg-green-700 text-sm disabled:opacity-50 flex items-center gap-2">
							{isLoading && (
								<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
							)}
							Export List
						</button>
					</div>
				</div>

				{/* Filters */}
				<div className="flex gap-4 mb-4">
					<select
						value={statusFilter}
						onChange={(e) => setStatusFilter(e.target.value)}
						className="border border-gray-300 rounded-md shadow-sm p-2 text-sm"
						aria-label="Filter by Status">
						<option value="all">All Statuses</option>
						<option value="ok">OK</option>
						<option value="due-soon">Due Soon</option>
						<option value="overdue">Overdue</option>
					</select>

					<select
						value={typeFilter}
						onChange={(e) => setTypeFilter(e.target.value)}
						className="border border-gray-300 rounded-md shadow-sm p-2 text-sm"
						aria-label="Filter by Type">
						<option value="all">All Types</option>
						<option value="isp">ISP</option>
						<option value="fire-evac">Fire Evac</option>
					</select>

					<select
						value={locationFilter}
						onChange={(e) => setLocationFilter(e.target.value)}
						className="border border-gray-300 rounded-md shadow-sm p-2 text-sm"
						aria-label="Filter by Location">
						<option value="all">All Locations</option>
						{[...new Set(overview.map((item) => item.location))].map(
							(location) => (
								<option key={location} value={location}>
									{location}
								</option>
							)
						)}
					</select>
				</div>

				<div className="overflow-x-auto">
					<table className="min-w-full divide-y divide-gray-200">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-4 py-3 text-left">
									<input
										type="checkbox"
										checked={
											selectedIds.length === filteredOverview.length &&
											filteredOverview.length > 0
										}
										onChange={() => handleSelectAll(filteredOverview)}
										className="rounded border-gray-300"
									/>
								</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
									Type
								</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
									Resident
								</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
									Location
								</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
									Description
								</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
									Due Date
								</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
									Status
								</th>
								<th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
									Last Action
								</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{filteredOverview.length === 0 ? (
								<tr>
									<td
										colSpan={8}
										className="px-4 py-6 text-center text-gray-500">
										No compliance items found.
									</td>
								</tr>
							) : (
								filteredOverview.map((item: any) => (
									<tr key={item.id} className="hover:bg-gray-50">
										<td className="px-4 py-3">
											<input
												type="checkbox"
												checked={selectedIds.includes(item.id)}
												onChange={() => handleSelect(item.id)}
												className="rounded border-gray-300"
											/>
										</td>
										<td className="px-4 py-2">
											{item.type === 'isp' ? 'ISP' : 'Fire Evac'}
										</td>
										<td className="px-4 py-2">{item.residentName}</td>
										<td className="px-4 py-2">{item.location}</td>
										<td className="px-4 py-2">{item.description}</td>
										<td className="px-4 py-2">{formatDate(item.dueDate)}</td>
										<td className="px-4 py-2">
											<span
												className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(item.status)}`}>
												{item.status === 'ok'
													? 'OK'
													: item.status === 'due-soon'
														? 'Due Soon'
														: 'Overdue'}
											</span>
										</td>
										<td className="px-4 py-2">{item.lastAction}</td>
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
