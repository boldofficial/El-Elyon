import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

export default function SecuritySettings() {
	const [activeTab, setActiveTab] = useState<'users' | 'audit'>('users');
	const [editingUser, setEditingUser] = useState<any>(null);
	const [auditFilters, setAuditFilters] = useState({
		actor: '',
		action: '',
		location: '',
		dateFrom: '',
		dateTo: '',
	});

	// State for data
	const [users, setUsers] = useState<any[]>([]);
	const [auditLogs, setAuditLogs] = useState<any[]>([]);
	const [auditActors, setAuditActors] = useState<any[]>([]);
	const [auditActions, setAuditActions] = useState<string[]>([]);
	const [auditLocations, setAuditLocations] = useState<string[]>([]);
	const [locations, setLocations] = useState<any[]>([]);
	const [isLoading, setIsLoading] = useState(false);

	// Fetch users with roles
	const fetchUsers = async () => {
		try {
			const response = await fetch('/api/admin/users-with-roles');
			if (!response.ok) throw new Error('Failed to fetch users');
			const data = await response.json();
			setUsers(data);
		} catch (error: any) {
			toast.error(error.message || 'Failed to fetch users');
		}
	};

	// Fetch audit logs with filters
	const fetchAuditLogs = async () => {
		try {
			const params = new URLSearchParams();
			if (auditFilters.actor) params.append('actor', auditFilters.actor);
			if (auditFilters.action) params.append('action', auditFilters.action);
			if (auditFilters.location)
				params.append('location', auditFilters.location);
			if (auditFilters.dateFrom)
				params.append('dateFrom', auditFilters.dateFrom);
			if (auditFilters.dateTo) params.append('dateTo', auditFilters.dateTo);

			const response = await fetch(
				`/api/admin/audit-logs?${params.toString()}`
			);
			if (!response.ok) throw new Error('Failed to fetch audit logs');
			const data = await response.json();
			setAuditLogs(data);
		} catch (error: any) {
			toast.error(error.message || 'Failed to fetch audit logs');
		}
	};

	// Fetch audit actors
	const fetchAuditActors = async () => {
		try {
			const response = await fetch('/api/admin/audit-logs/actors');
			if (!response.ok) throw new Error('Failed to fetch audit actors');
			const data = await response.json();
			setAuditActors(data);
		} catch (error: any) {
			toast.error(error.message || 'Failed to fetch audit actors');
		}
	};

	// Fetch audit actions
	const fetchAuditActions = async () => {
		try {
			const response = await fetch('/api/admin/audit-logs/actions');
			if (!response.ok) throw new Error('Failed to fetch audit actions');
			const data = await response.json();
			setAuditActions(data);
		} catch (error: any) {
			toast.error(error.message || 'Failed to fetch audit actions');
		}
	};

	// Fetch audit locations
	const fetchAuditLocations = async () => {
		try {
			const response = await fetch('/api/admin/audit-logs/locations');
			if (!response.ok) throw new Error('Failed to fetch audit locations');
			const data = await response.json();
			setAuditLocations(data);
		} catch (error: any) {
			toast.error(error.message || 'Failed to fetch audit locations');
		}
	};

	// Fetch locations summary
	const fetchLocations = async () => {
		try {
			const response = await fetch('/api/admin/locations/summary');
			if (!response.ok) throw new Error('Failed to fetch locations');
			const data = await response.json();
			setLocations(data);
		} catch (error: any) {
			toast.error(error.message || 'Failed to fetch locations');
		}
	};

	// Initial load
	useEffect(() => {
		fetchUsers();
		fetchAuditActors();
		fetchAuditActions();
		fetchAuditLocations();
		fetchLocations();
	}, []);

	// Fetch audit logs when filters change
	useEffect(() => {
		if (activeTab === 'audit') {
			fetchAuditLogs();
		}
	// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [auditFilters, activeTab]);

	const handleUpdateUser = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!editingUser) return;

		setIsLoading(true);
		try {
			const response = await fetch(`/api/admin/users/${editingUser.id}/role`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					role: editingUser.role,
					locations: editingUser.locations,
				}),
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to update user role');
			}

			toast.success('User role updated successfully!');
			setEditingUser(null);
			fetchUsers(); // Refresh users list
		} catch (error: any) {
			toast.error(error.message || 'Failed to update user role');
		} finally {
			setIsLoading(false);
		}
	};

	const handleDeleteUserRole = async (userId: string) => {
		if (
			!confirm(
				"Are you sure you want to remove this user's role? This will revoke their access."
			)
		) {
			return;
		}

		setIsLoading(true);
		try {
			const response = await fetch(`/api/admin/users/${userId}/role`, {
				method: 'DELETE',
			});

			if (!response.ok) {
				const error = await response.json();
				throw new Error(error.error || 'Failed to remove user role');
			}

			toast.success('User role removed successfully!');
			fetchUsers(); // Refresh users list
		} catch (error: any) {
			toast.error(error.message || 'Failed to remove user role');
		} finally {
			setIsLoading(false);
		}
	};

	const formatTimestamp = (timestamp: Date | string | number) => {
		return new Date(timestamp).toLocaleString();
	};

	const formatLastActive = (timestamp?: Date | string | number | null) => {
		if (!timestamp) return 'Never';
		const now = Date.now();
		const then = new Date(timestamp).getTime();
		const diff = now - then;
		const days = Math.floor(diff / (1000 * 60 * 60 * 24));
		const hours = Math.floor(diff / (1000 * 60 * 60));
		const minutes = Math.floor(diff / (1000 * 60));

		if (days > 0) return `${days}d ago`;
		if (hours > 0) return `${hours}h ago`;
		if (minutes > 0) return `${minutes}m ago`;
		return 'Just now';
	};

	const getRoleColor = (role: string | null) => {
		switch (role) {
			case 'admin':
				return 'bg-red-100 text-red-800';
			case 'supervisor':
				return 'bg-blue-100 text-blue-800';
			case 'staff':
				return 'bg-green-100 text-green-800';
			default:
				return 'bg-gray-100 text-gray-800';
		}
	};

	const getEventColor = (event: string) => {
		if (event.includes('delete') || event.includes('access_denied')) {
			return 'text-red-600';
		}
		if (event.includes('create') || event.includes('add')) {
			return 'text-green-600';
		}
		if (event.includes('update') || event.includes('edit')) {
			return 'text-blue-600';
		}
		return 'text-gray-600';
	};

	return (
		<div className="space-y-6">
			{/* Tabs */}
			<div className="border-b border-gray-200">
				<nav className="-mb-px flex space-x-8">
					<button
						onClick={() => setActiveTab('users')}
						className={`py-2 px-1 border-b-2 font-medium text-sm ${
							activeTab === 'users'
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}>
						User Management ({users.length})
					</button>
					<button
						onClick={() => setActiveTab('audit')}
						className={`py-2 px-1 border-b-2 font-medium text-sm ${
							activeTab === 'audit'
								? 'border-blue-500 text-blue-600'
								: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
						}`}>
						Audit Logs ({auditLogs.length})
					</button>
				</nav>
			</div>

			{/* User Management Tab */}
			{activeTab === 'users' && (
				<div className="space-y-6">
					{/* Edit User Modal */}
					{editingUser && (
						<div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
							<div className="bg-white rounded-lg shadow-lg w-full max-w-md mx-auto p-6">
								<h3 className="text-lg font-semibold mb-4">Edit User Role</h3>
								<form onSubmit={handleUpdateUser} className="space-y-4">
									<div>
										<label className="block text-sm font-medium text-gray-700 mb-2">
											User
										</label>
										<div className="text-sm text-gray-900 bg-gray-50 p-2 rounded">
											{editingUser.name} ({editingUser.email})
										</div>
									</div>

									<div>
										<label htmlFor="role-select" className="block text-sm font-medium text-gray-700 mb-2">
											Role
										</label>
										<select
											id="role-select"
											title="Select user role"
											value={editingUser.role || ''}
											onChange={(e) =>
												setEditingUser({...editingUser, role: e.target.value})
											}
											className="w-full border border-gray-300 rounded-md px-3 py-2"
											required>
											<option value="">Select role...</option>
											<option value="admin">Admin</option>
											<option value="supervisor">Supervisor</option>
											<option value="staff">Staff</option>
										</select>
									</div>

									<div>
										<label className="block text-sm font-medium text-gray-700 mb-2">
											Locations
										</label>
										<div className="border border-gray-300 rounded-md p-3 max-h-32 overflow-y-auto">
											{locations.map((location: any) => (
												<label
													key={location.name}
													className="flex items-center mb-2">
													<input
														type="checkbox"
														checked={editingUser.locations?.includes(
															location.name
														)}
														onChange={(e) => {
															const newLocations = e.target.checked
																? [
																		...(editingUser.locations || []),
																		location.name,
																	]
																: editingUser.locations.filter(
																		(loc: string) => loc !== location.name
																	);
															setEditingUser({
																...editingUser,
																locations: newLocations,
															});
														}}
														className="mr-2"
													/>
													<span className="text-sm">{location.name}</span>
												</label>
											))}
										</div>
									</div>

									<div className="flex justify-end space-x-2">
										<button
											type="button"
											onClick={() => setEditingUser(null)}
											className="px-4 py-2 bg-gray-200 text-gray-800 rounded hover:bg-gray-300"
											disabled={isLoading}>
											Cancel
										</button>
										<button
											type="submit"
											className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
											disabled={isLoading}>
											{isLoading && (
												<div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
											)}
											Save Changes
										</button>
									</div>
								</form>
							</div>
						</div>
					)}

					{/* Users List */}
					<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
						<div className="px-6 py-4 border-b border-gray-200">
							<h3 className="text-lg font-semibold">System Users</h3>
							<p className="text-sm text-gray-600 mt-1">
								Manage user roles and access permissions for the application.
							</p>
						</div>
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-gray-200">
								<thead className="bg-gray-50">
									<tr>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											User
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Role
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Locations
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Last Active
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Actions
										</th>
									</tr>
								</thead>
								<tbody className="bg-white divide-y divide-gray-200">
									{users.length === 0 ? (
										<tr>
											<td
												colSpan={5}
												className="px-6 py-4 text-center text-gray-500">
												No users found.
											</td>
										</tr>
									) : (
										users.map((user: any) => (
											<tr key={user.id} className="hover:bg-gray-50">
												<td className="px-6 py-4 whitespace-nowrap">
													<div>
														<div className="text-sm font-medium text-gray-900">
															{user.name}
														</div>
														<div className="text-sm text-gray-500">
															{user.email}
														</div>
													</div>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<span
														className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getRoleColor(user.role)}`}>
														{user.role || 'No Role'}
													</span>
												</td>
												<td className="px-6 py-4">
													<div className="text-sm text-gray-900">
														{user.locations && user.locations.length > 0 ? (
															<div className="flex flex-wrap gap-1">
																{user.locations.map(
																	(location: string, idx: number) => (
																		<span
																			key={idx}
																			className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
																			{location}
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
														{formatLastActive(user.lastActive)}
													</div>
												</td>
												<td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
													<div className="flex space-x-2">
														<button
															onClick={() => setEditingUser(user)}
															className="text-blue-600 hover:text-blue-800"
															disabled={isLoading}>
															Edit
														</button>
														{user.role && (
															<button
																onClick={() => handleDeleteUserRole(user.id)}
																className="text-red-600 hover:text-red-800"
																disabled={isLoading}>
																Remove Role
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
			)}

			{/* Audit Logs Tab */}
			{activeTab === 'audit' && (
				<div className="space-y-6">
					{/* Filters */}
					<div className="bg-white rounded-lg shadow-sm border p-6">
						<h3 className="text-lg font-semibold mb-4">Filter Audit Logs</h3>
						<div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
							<div>
								<label htmlFor="audit-actor-select" className="block text-sm font-medium text-gray-700 mb-2">
									Actor
								</label>
								<select
									id="audit-actor-select"
									title="Select audit actor"
									value={auditFilters.actor}
									onChange={(e) =>
										setAuditFilters({...auditFilters, actor: e.target.value})
									}
									className="w-full border border-gray-300 rounded-md px-3 py-2">
									<option value="">All Users</option>
									{auditActors.map((actor: any) => (
										<option key={actor.id} value={actor.id}>
											{actor.name} ({actor.role})
										</option>
									))}
								</select>
							</div>

							<div>
								<label htmlFor="audit-action-select" className="block text-sm font-medium text-gray-700 mb-2">
									Action
								</label>
								<select
									id="audit-action-select"
									title="Select audit action"
									value={auditFilters.action}
									onChange={(e) =>
										setAuditFilters({...auditFilters, action: e.target.value})
									}
									className="w-full border border-gray-300 rounded-md px-3 py-2">
									<option value="">All Actions</option>
									{auditActions.map((action: string) => (
										<option key={action} value={action}>
											{action.replace(/_/g, ' ')}
										</option>
									))}
								</select>
							</div>

							<div>
								<label htmlFor="audit-location-select" className="block text-sm font-medium text-gray-700 mb-2">
									Location
								</label>
								<select
									id="audit-location-select"
									title="Select audit location"
									value={auditFilters.location}
									onChange={(e) =>
										setAuditFilters({...auditFilters, location: e.target.value})
									}
									className="w-full border border-gray-300 rounded-md px-3 py-2">
									<option value="">All Locations</option>
									{auditLocations.map((location: string) => (
										<option key={location} value={location}>
											{location}
										</option>
									))}
								</select>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									From Date
								</label>
								<input
									type="date"
									value={auditFilters.dateFrom}
									onChange={(e) =>
										setAuditFilters({...auditFilters, dateFrom: e.target.value})
									}
									className="w-full border border-gray-300 rounded-md px-3 py-2"
								/>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 mb-2">
									To Date
								</label>
								<input
									type="date"
									value={auditFilters.dateTo}
									onChange={(e) =>
										setAuditFilters({...auditFilters, dateTo: e.target.value})
									}
									className="w-full border border-gray-300 rounded-md px-3 py-2"
								/>
							</div>
						</div>

						<div className="mt-4 flex gap-2">
							<button
								onClick={() =>
									setAuditFilters({
										actor: '',
										action: '',
										location: '',
										dateFrom: '',
										dateTo: '',
									})
								}
								className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300">
								Clear Filters
							</button>
						</div>
					</div>

					{/* Audit Logs List */}
					<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
						<div className="px-6 py-4 border-b border-gray-200">
							<h3 className="text-lg font-semibold">Audit Trail</h3>
							<p className="text-sm text-gray-600 mt-1">
								Complete log of all system activities and user actions.
							</p>
						</div>
						<div className="overflow-x-auto">
							<table className="min-w-full divide-y divide-gray-200">
								<thead className="bg-gray-50">
									<tr>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Timestamp
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Actor
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Action
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Object Type
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Location
										</th>
										<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
											Device
										</th>
									</tr>
								</thead>
								<tbody className="bg-white divide-y divide-gray-200">
									{auditLogs.length === 0 ? (
										<tr>
											<td
												colSpan={6}
												className="px-6 py-4 text-center text-gray-500">
												No audit logs found matching your filters.
											</td>
										</tr>
									) : (
										auditLogs.map((log: any) => (
											<tr key={log.id} className="hover:bg-gray-50">
												<td className="px-6 py-4 whitespace-nowrap">
													<div className="text-sm text-gray-900">
														{formatTimestamp(log.timestamp)}
													</div>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<div className="text-sm text-gray-900">
														{log.actorName}
													</div>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<div
														className={`text-sm font-medium ${getEventColor(log.event)}`}>
														{log.event.replace(/_/g, ' ')}
													</div>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<div className="text-sm text-gray-900">
														{log.objectType}
													</div>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<div className="text-sm text-gray-900">
														{log.location}
													</div>
												</td>
												<td className="px-6 py-4 whitespace-nowrap">
													<div className=" text-gray-500 font-mono text-xs">
														{log.deviceId}
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
			)}
		</div>
	);
}
