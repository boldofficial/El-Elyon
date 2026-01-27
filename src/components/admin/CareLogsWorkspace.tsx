'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

export default function CareLogsWorkspace() {
	const [activeTab, setActiveTab] = useState<'logs' | 'incidents'>('logs');
	const [logs, setLogs] = useState<any[]>([]);
	const [incidents, setIncidents] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);

	// Filter states
	const [filterLocation, setFilterLocation] = useState('');
	const [filterResident, setFilterResident] = useState('');
	const [limit, setLimit] = useState('50');

	// Resource states for dropdowns
	const [locations, setLocations] = useState<any[]>([]);
	const [residents, setResidents] = useState<any[]>([]);

	// Initial fetch for resources (locations/residents)
	useEffect(() => {
		async function fetchResources() {
			try {
				const [locRes, resRes] = await Promise.all([
					fetch('/api/admin/locations'),
					// As admin we want all residents to filter by
					fetch('/api/care/residents') 
				]);

				if (locRes.ok) setLocations(await locRes.json());
				if (resRes.ok) setResidents(await resRes.json());
			} catch (error) {
				console.error("Error fetching filter resources:", error);
				// Non-critical, can still use text input if dropdowns fail, but ideally we want them.
			}
		}
		fetchResources();
	}, []);

	const fetchData = async () => {
		setLoading(true);
		try {
			if (activeTab === 'logs') {
				// Build query params
				const params = new URLSearchParams();
				params.append('limit', limit);
				if (filterLocation) params.append('location', filterLocation);
				if (filterResident) params.append('residentId', filterResident);

				const res = await fetch(`/api/care/resident-logs?${params.toString()}`);
				if (!res.ok) throw new Error("Failed to fetch logs");
				
				const data = await res.json();
				setLogs(data);
			} else {
				// Incidents
				const params = new URLSearchParams();
				if (filterLocation) params.append('location', filterLocation);
				if (filterResident) params.append('residentId', filterResident);
				
				const res = await fetch(`/api/care/incidents?${params.toString()}`);
				if (!res.ok) throw new Error("Failed to fetch incidents");

				const data = await res.json();
				setIncidents(data);
			}
		} catch (error: any) {
			console.error("Error fetching data:", error);
			toast.error(error.message || "Failed to load data");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		fetchData();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [activeTab, filterLocation, filterResident, limit]);


	return (
		<div className="space-y-6">
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold text-gray-800">Care Logs & Incidents</h2>
					<p className="text-sm text-gray-500">
						View daily activity logs and incident reports across all locations.
					</p>
				</div>

				{/* Tabs */}
				<div className="flex bg-gray-100 rounded-lg p-1 self-start md:self-auto">
					<button
						className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
							activeTab === 'logs'
								? 'bg-white shadow text-blue-600'
								: 'text-gray-600 hover:text-gray-900'
						}`}
						onClick={() => setActiveTab('logs')}>
						Daily Logs
					</button>
					<button
						className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
							activeTab === 'incidents'
								? 'bg-white shadow text-red-600'
								: 'text-gray-600 hover:text-gray-900'
						}`}
						onClick={() => setActiveTab('incidents')}>
						Incident Reports
					</button>
				</div>
			</div>

			{/* Filters */}
			<div className="bg-white p-4 rounded-lg shadow-sm border grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">
						Location
					</label>
					<select
						className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
						value={filterLocation}
						onChange={(e) => setFilterLocation(e.target.value)}>
						<option value="">All Locations</option>
						{locations.map((loc: any) => (
							<option key={loc.id} value={loc.name}>
								{loc.name}
							</option>
						))}
					</select>
				</div>
				
				<div>
					<label className="block text-sm font-medium text-gray-700 mb-1">
						Resident
					</label>
					<select
						className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
						value={filterResident}
						onChange={(e) => setFilterResident(e.target.value)}>
						<option value="">All Residents</option>
						{residents.map((res: any) => (
							<option key={res.id} value={res.id}>
								{res.name}
							</option>
						))}
					</select>
				</div>

				{activeTab === 'logs' && (
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Limit
						</label>
						<select
							className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
							value={limit}
							onChange={(e) => setLimit(e.target.value)}>
							<option value="20">20 Recent</option>
							<option value="50">50 Recent</option>
							<option value="100">100 Recent</option>
						</select>
					</div>
				)}

				<div>
					<button
						onClick={fetchData}
						className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium border transition-colors">
						Refresh Data
					</button>
				</div>
			</div>

			<div className="bg-white rounded-lg shadow-sm border overflow-hidden min-h-[400px]">
				{loading ? (
					<div className="flex flex-col items-center justify-center p-12">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
						<p className="text-gray-500">Loading data...</p>
					</div>
				) : activeTab === 'logs' ? (
					// LOGS VIEW
					logs.length === 0 ? (
						<div className="p-12 text-center text-gray-500">
							No logs found matching your filters.
						</div>
					) : (
						<div className="divide-y divide-gray-200">
							{logs.map((log: any) => (
								<div
									key={log.id}
									className="p-4 hover:bg-gray-50 transition-colors">
									<div className="flex justify-between items-start mb-2">
										<div className="flex items-center gap-2">
											<span className="font-semibold text-gray-900">
												{log.resident?.name || 'Unknown Resident'}
											</span>
											<span className="text-gray-300">•</span>
											<span className="text-sm font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
												{log.logType || 'General Log'}
											</span>
											{log.location && (
												<>
													<span className="text-gray-300">•</span>
													<span className="text-xs text-gray-500 flex items-center gap-1">
														📍 {log.location}
													</span>
												</>
											)}
										</div>
										<span className="text-xs text-gray-500 whitespace-nowrap font-mono">
											{new Date(log.createdAt).toLocaleString()}
										</span>
									</div>
									
									<p className="text-gray-700 text-sm whitespace-pre-wrap pl-1 border-l-2 border-gray-100 ml-1">
										{log.content}
									</p>
									
									{log.activities && log.activities.length > 0 && (
										<div className="mt-3 flex flex-wrap gap-2 ml-1">
											{log.activities.map((act: any) => (
												<span
													key={act.id}
													className={`text-xs px-2 py-1 rounded-md border flex items-center gap-1.5 ${
														act.completed
															? 'bg-green-50 border-green-200 text-green-700'
															: 'bg-yellow-50 border-yellow-200 text-yellow-700'
													}`}>
													{act.completed ? '✓' : '○'} {act.activityType}
												</span>
											))}
										</div>
									)}
									
									<div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
										<span>By {log.authorName || 'Unknown'}</span>
									</div>
								</div>
							))}
						</div>
					)
				) : // INCIDENTS VIEW
				incidents.length === 0 ? (
					<div className="p-12 text-center text-gray-500">
						No incident reports found.
					</div>
				) : (
					<table className="min-w-full divide-y divide-gray-200">
						<thead className="bg-gray-50">
							<tr>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Date
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Resident
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Type / Severity
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Location
								</th>
								<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
									Description
								</th>
							</tr>
						</thead>
						<tbody className="bg-white divide-y divide-gray-200">
							{incidents.map((inc: any) => (
								<tr key={inc.id} className="hover:bg-gray-50 transition-colors">
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
										{new Date(inc.incidentDate).toLocaleDateString()}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
										{inc.resident?.name || 'Unknown'}
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<div className="text-sm text-gray-900 capitalize font-medium">
											{inc.incidentType}
										</div>
										<span
											className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full mt-1 ${
												inc.severity === 'critical' ||
												inc.severity === 'high'
													? 'bg-red-100 text-red-800'
													: inc.severity === 'medium'
													? 'bg-yellow-100 text-yellow-800'
													: 'bg-green-100 text-green-800'
											}`}>
											{inc.severity}
										</span>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
										{inc.location}
									</td>
									<td
										className="px-6 py-4 text-sm text-gray-500 max-w-xs truncate cursor-help"
										title={inc.description}>
										{inc.description}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}
