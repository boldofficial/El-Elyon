'use client';

import React, {useState, useEffect, useMemo} from 'react';

export default function SupervisorTeamWorkspace() {
	const [userRole, setUserRole] = useState<any>(null);
	const [teamMembers, setTeamMembers] = useState<any[]>([]);
	const [teamStats, setTeamStats] = useState<any>(null);
	const [managedLocations, setManagedLocations] = useState<string[]>([]);
	const [shiftSummary, setShiftSummary] = useState<any[]>([]);
	const [logStats, setLogStats] = useState<any>(null);
	const [pastShifts, setPastShifts] = useState<any[]>([]);
	const [isLoadingPastShifts, setIsLoadingPastShifts] = useState(false);
	const [selectedStaff, setSelectedStaff] = useState<string>('all');

	const [selectedLocation, setSelectedLocation] = useState<string>('all');
	const [dateRange, setDateRange] = useState({
		from: '',
		to: '',
	});

	useEffect(() => {
		async function fetchData() {
			try {
				const [roleRes, membersRes, locationsRes] = await Promise.all([
					fetch('/api/users/role'),
					fetch('/api/supervisor/team-members'),
					fetch('/api/supervisor/managed-locations'),
				]);

				setUserRole(await roleRes.json());
				setTeamMembers(await membersRes.json());
				setManagedLocations(await locationsRes.json());
			} catch (error) {
				console.error('Error fetching team data:', error);
			}
		}

		fetchData();
	}, []);

	useEffect(() => {
		async function fetchStats() {
			try {
				const params = new URLSearchParams();
				if (dateRange.from)
					params.append(
						'dateFrom',
						new Date(dateRange.from).getTime().toString()
					);
				if (dateRange.to)
					params.append('dateTo', new Date(dateRange.to).getTime().toString());
				if (selectedLocation !== 'all')
					params.append('location', selectedLocation);

				const [shiftRes, logRes, teamStatsRes] = await Promise.all([
					fetch(`/api/supervisor/team-shift-summary?${params}`),
					fetch(`/api/supervisor/team-log-stats?${params}`),
					fetch(`/api/supervisor/team-stats?${params}`),
				]);

				setShiftSummary(await shiftRes.json());
				setLogStats(await logRes.json());
				setTeamStats(await teamStatsRes.json());
			} catch (error) {
				console.error('Error fetching stats:', error);
			}
		}

		fetchStats();
	}, [dateRange, selectedLocation]);

	useEffect(() => {
		async function fetchPastShifts() {
			try {
				setIsLoadingPastShifts(true);
				const params = new URLSearchParams();
				if (dateRange.from)
					params.append(
						'dateFrom',
						new Date(dateRange.from).getTime().toString()
					);
				if (dateRange.to)
					params.append('dateTo', new Date(dateRange.to).getTime().toString());
				if (selectedLocation !== 'all') params.append('location', selectedLocation);
				if (selectedStaff !== 'all') params.append('staffId', selectedStaff);
				params.append('limit', '50');

				const res = await fetch(`/api/supervisor/team-shifts?${params}`);
				const data = await res.json();
				setPastShifts(data);
			} catch (error) {
				console.error('Error fetching past shifts:', error);
			} finally {
				setIsLoadingPastShifts(false);
			}
		}

		fetchPastShifts();
	}, [dateRange, selectedLocation, selectedStaff]);

	const filteredTeamMembers =
		selectedLocation === 'all'
			? teamMembers
			: teamMembers.filter((member: any) =>
					member.locations.includes(selectedLocation)
				);

	const recentShiftByStaff = useMemo(() => {
		const map: Record<string, any> = {};
		for (const summary of shiftSummary) {
			if (!map[summary.staffId]) {
				map[summary.staffId] = summary;
			}
		}
		return map;
	}, [shiftSummary]);

	const formatDurationHours = (ms: number) =>
		Math.max(0, Math.round(ms / (1000 * 60 * 60)));

	const formatDateTime = (value?: string) =>
		value ? new Date(value).toLocaleString() : '—';

	const isAdmin = userRole?.role === 'admin';

	if (!userRole || !['admin', 'supervisor'].includes(userRole.role)) {
		return (
			<div className="text-center py-12">
				<div className="text-6xl mb-4">🚫</div>
				<h3 className="text-lg font-medium text-gray-900 mb-2">
					Access Denied
				</h3>
				<p className="text-gray-600">
					You need supervisor or admin access to view this page.
				</p>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold text-gray-900">Team Management</h2>
					<p className="text-gray-600">
						{isAdmin
							? 'All locations'
							: `Managing: ${managedLocations.join(', ')}`}
					</p>
				</div>
			</div>

			<div className="grid grid-cols-1 md:grid-cols-4 gap-6">
				<div className="bg-white rounded-lg shadow-sm border p-6">
					<div className="flex items-center">
						<div className="shrink-0">
							<svg
								className="h-8 w-8 text-blue-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M17 20h5v-2a3 3 0 00-5.196-2.121M9 20H4v-2a3 3 0 015.196-2.121m0 0a5.002 5.002 0 019.608 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
						</div>
						<div className="ml-4">
							<p className="text-sm font-medium text-gray-600">Team Members</p>
							<p className="text-2xl font-semibold text-gray-900">
								{teamMembers.length}
							</p>
						</div>
					</div>
				</div>

				<div className="bg-white rounded-lg shadow-sm border p-6">
					<div className="flex items-center">
						<div className="shrink-0">
							<svg
								className="h-8 w-8 text-green-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
								/>
							</svg>
						</div>
						<div className="ml-4">
							<p className="text-sm font-medium text-gray-600">
								Currently Working
							</p>
							<p className="text-2xl font-semibold text-gray-900">
								{shiftSummary?.filter((s: any) => s.isCurrentlyWorking)
									.length || 0}
							</p>
						</div>
					</div>
				</div>

				<div className="bg-white rounded-lg shadow-sm border p-6">
					<div className="flex items-center">
						<div className="shrink-0">
							<svg
								className="h-8 w-8 text-purple-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
								/>
							</svg>
						</div>
						<div className="ml-4">
							<p className="text-sm font-medium text-gray-600">Total Logs</p>
							<p className="text-2xl font-semibold text-gray-900">
								{logStats?.totalLogs || 0}
							</p>
						</div>
					</div>
				</div>

				<div className="bg-white rounded-lg shadow-sm border p-6">
					<div className="flex items-center">
						<div className="shrink-0">
							<svg
								className="h-8 w-8 text-orange-600"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor">
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
								/>
								<path
									strokeLinecap="round"
									strokeLinejoin="round"
									strokeWidth={2}
									d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
								/>
							</svg>
						</div>
						<div className="ml-4">
							<p className="text-sm font-medium text-gray-600">Locations</p>
							<p className="text-2xl font-semibold text-gray-900">
								{managedLocations.length}
							</p>
						</div>
					</div>
				</div>

				{teamStats && (
					<div className="bg-white rounded-lg shadow-sm border p-6">
						<div className="flex items-center">
							<div className="shrink-0">
								<svg
									className="h-8 w-8 text-indigo-600"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
									/>
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
									/>
								</svg>
							</div>
							<div className="ml-4">
								<p className="text-sm font-medium text-gray-600">Total Shifts</p>
								<p className="text-2xl font-semibold text-gray-900">
									{teamStats.totalShifts || 0}
								</p>
							</div>
						</div>
					</div>
				)}
			</div>

			<div className="bg-white rounded-lg shadow-sm border p-6">
				<h3 className="text-lg font-semibold mb-4">Filters</h3>
				<div className="grid grid-cols-1 md:grid-cols-4 gap-4">
					<div>
						<label
							htmlFor="location-select"
							className="block text-sm font-medium text-gray-700 mb-2">
							Location
						</label>
						<select
							id="location-select"
							value={selectedLocation}
							onChange={(e) => setSelectedLocation(e.target.value)}
							className="w-full border border-gray-300 rounded-md px-3 py-2">
							<option value="all">All Locations</option>
							{managedLocations.map((location: string) => (
								<option key={location} value={location}>
									{location}
								</option>
							))}
						</select>
					</div>

					<div>
						<label
							htmlFor="from-date"
							className="block text-sm font-medium text-gray-700 mb-2">
							From Date
						</label>
						<input
							id="from-date"
							type="date"
							value={dateRange.from}
							onChange={(e) =>
								setDateRange((prev) => ({...prev, from: e.target.value}))
							}
							className="w-full border border-gray-300 rounded-md px-3 py-2"
						/>
					</div>

					<div>
						<label
							htmlFor="to-date"
							className="block text-sm font-medium text-gray-700 mb-2">
							To Date
						</label>
						<input
							id="to-date"
							type="date"
							value={dateRange.to}
							onChange={(e) =>
								setDateRange((prev) => ({...prev, to: e.target.value}))
							}
							className="w-full border border-gray-300 rounded-md px-3 py-2"
						/>
					</div>

					<div>
						<label
							htmlFor="staff-select"
							className="block text-sm font-medium text-gray-700 mb-2">
							Team Member
						</label>
						<select
							id="staff-select"
							value={selectedStaff}
							onChange={(e) => setSelectedStaff(e.target.value)}
							className="w-full border border-gray-300 rounded-md px-3 py-2">
							<option value="all">All Team Members</option>
							{teamMembers.map((member) => (
								<option key={member.id} value={member.id}>
									{member.name}
								</option>
							))}
						</select>
					</div>
				</div>
			</div>

			<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
				<div className="px-6 py-4 border-b border-gray-200">
					<h3 className="text-lg font-semibold">
						Team Members ({filteredTeamMembers.length})
					</h3>
				</div>

				{filteredTeamMembers.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						<div className="text-4xl mb-4">👥</div>
						<p className="text-lg font-medium mb-2">No team members</p>
						<p className="text-sm">
							{selectedLocation !== 'all'
								? 'No team members in the selected location'
								: 'No team members found'}
						</p>
					</div>
				) : (
					<div className="divide-y divide-gray-200">
						{filteredTeamMembers.map((member: any) => {
							const memberShift = recentShiftByStaff[member.id];
							const memberLogCount = logStats?.logsByAuthor?.[member.name] || 0;

							return (
								<div key={member.id} className="p-6">
									<div className="flex items-start justify-between">
										<div className="flex-1">
											<div className="flex items-center space-x-3 mb-3">
												<div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
													<span className="text-blue-600 font-semibold">
														{member.name.charAt(0).toUpperCase()}
													</span>
												</div>
												<div>
													<h4 className="text-lg font-medium text-gray-900">
														{member.name}
													</h4>
													<p className="text-sm text-gray-600">
														{member.email}
													</p>
												</div>
												<span
													className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
														member.role === 'admin'
															? 'bg-red-100 text-red-800'
															: member.role === 'supervisor'
																? 'bg-blue-100 text-blue-800'
																: 'bg-green-100 text-green-800'
													}`}>
													{member.role}
												</span>
												{memberShift?.isCurrentlyWorking && (
													<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
														Currently Working
													</span>
												)}
											</div>

											<div className="space-y-2">
												<div className="flex items-center space-x-2">
													<span className="font-medium">Locations:</span>
													<span>{member.locations.join(', ')}</span>
												</div>
												<div className="space-y-2">
													{memberShift ? (
														<div className="text-sm text-gray-700">
															<div className="flex items-center space-x-2">
																<span className="font-medium">Last shift:</span>
																<span>
																	{formatDateTime(memberShift.clockInTime)} →{' '}
																	{memberShift.clockOutTime
																		? formatDateTime(memberShift.clockOutTime)
																		: 'Still working'}
																</span>
															</div>
															<div className="flex items-center space-x-2">
																<span className="font-medium">Location:</span>
																<span className={memberShift.isCurrentlyWorking ? 'text-green-600' : ''}>
																	{memberShift.location}
																</span>
															</div>
															<div className="flex items-center space-x-4 mt-2">
																<span className="text-xs bg-gray-100 px-2 py-1 rounded">
																	{formatDurationHours(memberShift.duration)}h logged
																</span>
																<span className="text-xs bg-gray-100 px-2 py-1 rounded">
																	{memberShift.logCount || 0} shift logs
																</span>
															</div>
														</div>
													) : (
														<p className="text-sm text-gray-500">No shifts recorded yet.</p>
													)}
													<div className="flex items-center space-x-4 mt-2">
														<span className="text-xs bg-gray-100 px-2 py-1 rounded">
															{memberLogCount} logs in period
														</span>
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>
							);
						})}
					</div>
				)}
			</div>

			<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
				<div className="px-6 py-4 border-b border-gray-200">
					<h3 className="text-lg font-semibold">Log Statistics</h3>
				</div>

				<div className="divide-y divide-gray-200">
					{!logStats || logStats.totalLogs === 0 ? (
						<div className="p-8 text-center text-gray-500">
							<div className="text-4xl mb-4">📝</div>
							<p className="text-lg font-medium mb-2">No log data</p>
							<p className="text-sm">No logs created for this period</p>
						</div>
					) : (
						<div className="p-6">
							<div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
								<div className="bg-blue-50 p-4 rounded-lg">
									<p className="text-sm font-medium text-blue-600">
										Total Logs
									</p>
									<p className="text-2xl font-bold text-blue-900">
										{logStats.totalLogs}
									</p>
								</div>
								<div className="bg-green-50 p-4 rounded-lg">
									<p className="text-sm font-medium text-green-600">
										Templates Used
									</p>
									<p className="text-2xl font-bold text-green-900">
										{Object.keys(logStats.logsByTemplate || {}).length}
									</p>
								</div>
								<div className="bg-purple-50 p-4 rounded-lg">
									<p className="text-sm font-medium text-purple-600">
										Active Authors
									</p>
									<p className="text-2xl font-bold text-purple-900">
										{Object.keys(logStats.logsByAuthor || {}).length}
									</p>
								</div>
							</div>

							<div className="space-y-4">
								<div>
									<h4 className="font-medium text-gray-900 mb-2">
										Logs by Author
									</h4>
									<div className="space-y-2">
										{Object.entries(logStats.logsByAuthor || {}).map(
											([author, count]) => (
												<div
													key={author}
													className="flex justify-between items-center">
													<span className="text-sm text-gray-700">
														{author}
													</span>
													<span className="text-sm font-medium text-gray-900">
														{count as number}
													</span>
												</div>
											)
										)}
									</div>
								</div>

								<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
									<div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
										<h3 className="text-lg font-semibold">Past Shifts</h3>
										<span className="text-sm text-gray-500">Showing up to 50 shifts based on filters</span>
									</div>
									{isLoadingPastShifts ? (
										<div className="p-6 text-center text-gray-500">Loading shifts…</div>
									) : pastShifts.length === 0 ? (
										<div className="p-8 text-center text-gray-500">No shifts match the current filters.</div>
									) : (
										<div className="overflow-x-auto">
											<table className="min-w-full divide-y divide-gray-200">
												<thead className="bg-gray-50">
													<tr>
														<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Staff</th>
														<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
														<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock In</th>
														<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Clock Out</th>
														<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
														<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Logs</th>
														<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Activities</th>
													</tr>
												</thead>
												<tbody className="bg-white divide-y divide-gray-200">
													{pastShifts.map((shift) => (
														<tr key={shift.shiftId}>
															<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
																<div className="font-medium">{shift.staffName}</div>
																<div className="text-gray-500 text-xs">{shift.staffEmail}</div>
															</td>
															<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{shift.location}</td>
															<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDateTime(shift.clockInTime)}</td>
															<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{shift.clockOutTime ? formatDateTime(shift.clockOutTime) : 'Still working'}</td>
															<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{formatDurationHours(shift.durationMs)}h</td>
															<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{shift.logCount}</td>
															<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{shift.activityCount}</td>
														</tr>
													))}
												</tbody>
											</table>
										</div>
									)}
								</div>

								<div>
									<h4 className="font-medium text-gray-900 mb-2">
										Logs by Template
									</h4>
									<div className="space-y-2">
										{Object.entries(logStats.logsByTemplate || {}).map(
											([template, count]) => (
												<div
													key={template}
													className="flex justify-between items-center">
													<span className="text-sm text-gray-700">
														{template.replace(/_/g, ' ')}
													</span>
													<span className="text-sm font-medium text-gray-900">
														{count as number}
													</span>
												</div>
											)
										)}
									</div>
								</div>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
