'use client';

import React, {useState, useEffect, useCallback} from 'react';
import {toast} from 'sonner';
import SharedLogsTable from '../care/SharedLogsTable';
import SharedIncidentsAccordion from '../care/SharedIncidentsAccordion';
import CareLogWithActivities from '../care/CareLogWithActivities';
import IncidentReportForm from '../care/IncidentReportForm';

type TabId = 'logs' | 'log-activity' | 'report-incident' | 'incidents';

interface Resident {
	id: string;
	name: string;
	location: string;
}

interface Location {
	id: string;
	name: string;
}

export default function CareLogsWorkspace() {
	const [activeTab, setActiveTab] = useState<TabId>('logs');
	const [logs, setLogs] = useState<any[]>([]);
	const [incidents, setIncidents] = useState<any[]>([]);
	const [loading, setLoading] = useState(true);

	// Filter states
	const [filterLocation, setFilterLocation] = useState('');
	const [filterResident, setFilterResident] = useState('');
	const [limit, setLimit] = useState('50');

	// Resource states for dropdowns
	const [locations, setLocations] = useState<Location[]>([]);
	const [residents, setResidents] = useState<Resident[]>([]);

	// Create-tab states
	const [selectedResidentForLog, setSelectedResidentForLog] = useState<Resident | null>(null);
	const [selectedResidentForIncident, setSelectedResidentForIncident] = useState<Resident | null>(null);

	// Initial fetch for resources (locations/residents)
	useEffect(() => {
		async function fetchResources() {
			try {
				const [locRes, resRes] = await Promise.all([
					fetch('/api/admin/locations'),
					fetch('/api/care/residents'),
				]);

				if (locRes.ok) setLocations(await locRes.json());
				if (resRes.ok) setResidents(await resRes.json());
			} catch (error) {
				console.error('Error fetching filter resources:', error);
			}
		}
		fetchResources();
	}, []);

	const fetchData = useCallback(async () => {
		setLoading(true);
		try {
			if (activeTab === 'logs') {
				const params = new URLSearchParams();
				params.append('limit', limit);
				if (filterLocation) params.append('location', filterLocation);
				if (filterResident) params.append('residentId', filterResident);

				const res = await fetch(`/api/care/resident-logs?${params.toString()}`);
				if (!res.ok) throw new Error('Failed to fetch logs');
				setLogs(await res.json());
			} else if (activeTab === 'incidents') {
				const params = new URLSearchParams();
				if (filterLocation) params.append('location', filterLocation);
				if (filterResident) params.append('residentId', filterResident);

				const res = await fetch(`/api/care/incidents?${params.toString()}`);
				if (!res.ok) throw new Error('Failed to fetch incidents');
				setIncidents(await res.json());
			}
		} catch (error: any) {
			console.error('Error fetching data:', error);
			toast.error(error.message || 'Failed to load data');
		} finally {
			setLoading(false);
		}
	}, [activeTab, filterLocation, filterResident, limit]);

	useEffect(() => {
		if (activeTab === 'logs' || activeTab === 'incidents') {
			fetchData();
		} else {
			setLoading(false);
		}
	}, [activeTab, fetchData]);

	// Group residents by location for the picker
	const residentsByLocation = residents.reduce<Record<string, Resident[]>>((acc, resident) => {
		const loc = resident.location || 'Unknown Location';
		if (!acc[loc]) acc[loc] = [];
		acc[loc].push(resident);
		return acc;
	}, {});

	const sortedLocationKeys = Object.keys(residentsByLocation).sort();

	const handleLogSuccess = () => {
		toast.success('Activity log saved successfully');
		setSelectedResidentForLog(null);
		setActiveTab('logs');
		// Data will be fetched by the useEffect when tab changes
	};

	const handleIncidentSuccess = () => {
		toast.success('Incident report submitted successfully');
		setSelectedResidentForIncident(null);
		setActiveTab('incidents');
	};

	const handleIncidentCancel = () => {
		setSelectedResidentForIncident(null);
	};

	// ── Resident Picker Component ──
	const ResidentPicker = ({
		selectedResident,
		onSelect,
		label,
	}: {
		selectedResident: Resident | null;
		onSelect: (resident: Resident | null) => void;
		label: string;
	}) => (
		<div className="bg-white rounded-lg shadow-sm border p-6 mb-6">
			<label className="block text-sm font-medium text-gray-700 mb-2">
				{label} <span className="text-red-500">*</span>
			</label>
			<select
				className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
				value={selectedResident?.id || ''}
				onChange={(e) => {
					const residentId = e.target.value;
					if (!residentId) {
						onSelect(null);
						return;
					}
					const found = residents.find((r) => r.id === residentId);
					if (found) onSelect(found);
				}}>
				<option value="">Choose a resident...</option>
				{sortedLocationKeys.map((loc) => (
					<optgroup key={loc} label={`📍 ${loc}`}>
						{residentsByLocation[loc]
							.sort((a, b) => a.name.localeCompare(b.name))
							.map((r) => (
								<option key={r.id} value={r.id}>
									{r.name}
								</option>
							))}
					</optgroup>
				))}
			</select>
			{selectedResident && (
				<div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
					<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
						{selectedResident.location}
					</span>
					<span className="font-medium text-gray-900">{selectedResident.name}</span>
				</div>
			)}
		</div>
	);

	// ── Tab Definitions ──
	const TABS: {id: TabId; label: string; icon: string}[] = [
		{id: 'logs', label: 'View Logs', icon: '👁️'},
		{id: 'log-activity', label: 'Log Activity', icon: '✏️'},
		{id: 'report-incident', label: 'Report Incident', icon: '⚠️'},
		{id: 'incidents', label: 'Incidents', icon: '🚨'},
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
				<div>
					<h2 className="text-xl font-semibold text-gray-800">Care Logs & Incidents</h2>
					<p className="text-sm text-gray-500">
						View, create, and manage activity logs and incident reports for residents.
					</p>
				</div>
			</div>

			{/* Tabs */}
			<div className="border-b border-gray-200">
				<nav className="-mb-px flex space-x-1 overflow-x-auto">
					{TABS.map((tab) => {
						const isActive = activeTab === tab.id;
						return (
							<button
								key={tab.id}
								onClick={() => setActiveTab(tab.id)}
								className={`flex items-center gap-2 px-4 py-3 border-b-2 text-sm font-medium whitespace-nowrap transition-colors ${
									isActive
										? 'border-blue-500 text-blue-600'
										: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
								}`}>
								<span>{tab.icon}</span>
								<span>{tab.label}</span>
							</button>
						);
					})}
				</nav>
			</div>

			{/* ═══════════ VIEW LOGS TAB ═══════════ */}
			{activeTab === 'logs' && (
				<>
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
								{locations.map((loc) => (
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
								{residents.map((res) => (
									<option key={res.id} value={res.id}>
										{res.name}
									</option>
								))}
							</select>
						</div>

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
								<p className="text-gray-500">Loading logs...</p>
							</div>
						) : (
							<SharedLogsTable logs={logs} />
						)}
					</div>
				</>
			)}

			{/* ═══════════ LOG ACTIVITY TAB ═══════════ */}
			{activeTab === 'log-activity' && (
				<>
					<ResidentPicker
						selectedResident={selectedResidentForLog}
						onSelect={setSelectedResidentForLog}
						label="Select Resident to Log Activity"
					/>

					{selectedResidentForLog ? (
						<CareLogWithActivities
							residentId={selectedResidentForLog.id}
							residentName={selectedResidentForLog.name}
							location={selectedResidentForLog.location}
							onSuccess={handleLogSuccess}
						/>
					) : (
						<div className="bg-white rounded-lg shadow-sm border p-12 text-center">
							<div className="text-4xl mb-4">📋</div>
							<h3 className="text-lg font-medium text-gray-900 mb-2">
								Select a Resident
							</h3>
							<p className="text-gray-500 max-w-md mx-auto">
								Choose a resident from the dropdown above to start logging their
								daily activities, medications, meals, and general notes.
							</p>
						</div>
					)}
				</>
			)}

			{/* ═══════════ REPORT INCIDENT TAB ═══════════ */}
			{activeTab === 'report-incident' && (
				<>
					<ResidentPicker
						selectedResident={selectedResidentForIncident}
						onSelect={setSelectedResidentForIncident}
						label="Select Resident to Report Incident"
					/>

					{selectedResidentForIncident ? (
						<IncidentReportForm
							residentId={selectedResidentForIncident.id}
							residentName={selectedResidentForIncident.name}
							location={selectedResidentForIncident.location}
							onSuccess={handleIncidentSuccess}
							onCancel={handleIncidentCancel}
						/>
					) : (
						<div className="bg-white rounded-lg shadow-sm border p-12 text-center">
							<div className="text-4xl mb-4">⚠️</div>
							<h3 className="text-lg font-medium text-gray-900 mb-2">
								Select a Resident
							</h3>
							<p className="text-gray-500 max-w-md mx-auto">
								Choose a resident from the dropdown above to file an incident
								report including type, severity, description, and attachments.
							</p>
						</div>
					)}
				</>
			)}

			{/* ═══════════ INCIDENTS TAB ═══════════ */}
			{activeTab === 'incidents' && (
				<>
					{/* Filters */}
					<div className="bg-white p-4 rounded-lg shadow-sm border grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-1">
								Location
							</label>
							<select
								className="w-full border rounded-md px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
								value={filterLocation}
								onChange={(e) => setFilterLocation(e.target.value)}>
								<option value="">All Locations</option>
								{locations.map((loc) => (
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
								{residents.map((res) => (
									<option key={res.id} value={res.id}>
										{res.name}
									</option>
								))}
							</select>
						</div>

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
								<p className="text-gray-500">Loading incidents...</p>
							</div>
						) : (
							<SharedIncidentsAccordion incidents={incidents} />
						)}
					</div>
				</>
			)}
		</div>
	);
}
