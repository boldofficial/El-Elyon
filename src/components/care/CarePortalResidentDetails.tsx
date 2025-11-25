// src/components/care/CarePortalResidentDetails.tsx

'use client';

import React, {useState} from 'react';
import CareLogWithActivities from './CareLogWithActivities';
// import IncidentReportForm from './IncidentReportForm';
import IncidentReportsList from './IncidentReportsList';

interface Resident {
	id: string;
	name: string;
	location: string;
}

interface CarePortalResidentDetailsProps {
	resident: Resident;
	userLocation: string;
	userName: string;
	shiftId?: string;
}

type TabType = 'log' | 'incidents' | 'history';

export default function CarePortalResidentDetails({
	resident,
	userLocation,
	userName,
	shiftId,
}: CarePortalResidentDetailsProps) {
	const [activeTab, setActiveTab] = useState<TabType>('log');
	const [showIncidentForm, setShowIncidentForm] = useState(false);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	const tabs = [
		{id: 'log' as TabType, label: 'Activity Log', icon: '📋'},
		{id: 'incidents' as TabType, label: 'Incident Reports', icon: '⚠️'},
		{id: 'history' as TabType, label: 'History', icon: '📜'},
	];

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="bg-white rounded-lg shadow p-6">
				<h1 className="text-3xl font-bold text-gray-900">{resident.name}</h1>
				<p className="text-gray-600 mt-1">Location: {resident.location}</p>
			</div>

			{/* Tabs */}
			<div className="bg-white rounded-lg shadow">
				<div className="border-b">
					<nav className="flex space-x-8 px-6" aria-label="Tabs">
						{tabs.map((tab) => (
							<button
								key={tab.id}
								onClick={() => {
									setActiveTab(tab.id);
									setShowIncidentForm(false);
								}}
								className={`py-4 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
									activeTab === tab.id
										? 'border-blue-500 text-blue-600'
										: 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
								}`}>
								<span className="mr-2">{tab.icon}</span>
								{tab.label}
							</button>
						))}
					</nav>
				</div>

				{/* Tab Content */}
				<div className="p-6">
					{activeTab === 'log' && (
						<CareLogWithActivities
							residentId={resident.id}
							residentName={resident.name}
							location={userLocation}
							shiftId={shiftId}
							authorName={userName}
							onSuccess={() => setRefreshTrigger((prev) => prev + 1)}
						/>
					)}

					{activeTab === 'incidents' && (
						<div className="space-y-6">
							{!showIncidentForm && (
								<div className="flex justify-end">
									<button
										onClick={() => setShowIncidentForm(true)}
										className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
										+ Report New Incident
									</button>
								</div>
							)}

							{showIncidentForm ? (
								<IncidentReportForm
									residentId={resident.id}
									residentName={resident.name}
									location={userLocation}
									onSuccess={() => {
										setShowIncidentForm(false);
										setRefreshTrigger((prev) => prev + 1);
									}}
									onCancel={() => setShowIncidentForm(false)}
								/>
							) : (
								<IncidentReportsList
									residentId={resident.id}
									refreshTrigger={refreshTrigger}
								/>
							)}
						</div>
					)}

					{activeTab === 'history' && (
						<div className="text-center py-12 text-gray-500">
							<p>Activity history coming soon...</p>
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
