'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';
import SharedLogsTable from '../care/SharedLogsTable';
import SharedIncidentsAccordion from '../care/SharedIncidentsAccordion';

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

			<div className="bg-white rounded-lg shadow-sm border overflow-hidden min-h-[400pxx]">
				{loading ? (
					<div className="flex flex-col items-center justify-center p-12">
						<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
						<p className="text-gray-500">Loading data...</p>
					</div>
				) : activeTab === 'logs' ? (
					// LOGS VIEW
					<SharedLogsTable logs={logs} />
				) : (
					// INCIDENTS VIEW
					<SharedIncidentsAccordion incidents={incidents} />
				)}
			</div>
		</div>
	);
}
