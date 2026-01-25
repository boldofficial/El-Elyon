// src/components/care/CarePortalResidentDetails.tsx

'use client';

import React, {useState, useEffect} from 'react';
import CareLogWithActivities from './CareLogWithActivities';
import ResidentActivityHistory from './ResidentActivityHistory';
import IncidentReportForm from './IncidentReportForm';
import IncidentReportsList from './IncidentReportsList';

interface Resident {
	id: string;
	name: string;
	dateOfBirth?: string;
	dob?: string;
	location: string;
	phone?: string;
	placementDate?: Date;
	sex?: string;
	weight?: string;
	height?: string;
	hairColor?: string;
	diagnosis?: string;
	supportBroker?: string;
	importantRelationships?: string;
	fundingAgency?: string;
	caseManagerName?: string;
	caseManagerPhone?: string;
	caseManagerEmail?: string;
	vocationalAgency?: string;
	vocationalAgencyAddress?: string;
	guardianIds?: string[];
	medicalInfo?: string;
	careNotes?: string;
	profileImageId?: string;
	createdAt?: Date;
	createdBy?: string;
}

interface CarePortalResidentDetailsProps {
	resident: Resident;
	userLocation: string;
	userName: string;
	shiftId?: string;
}

type TabType = 'log' | 'incidents' | 'history';

export default function CarePortalResidentDetails({
	resident: initialResident, // Renamed to initialResident
	userLocation,
	userName,
	shiftId,
}: CarePortalResidentDetailsProps) {
	const [resident, setResident] = useState<Resident>(initialResident); // State for resident details
	const [activeTab, setActiveTab] = useState<TabType>('log');
	const [showIncidentForm, setShowIncidentForm] = useState(false);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	// Fetch full resident details when component mounts or initialResident changes
	useEffect(() => {
		async function fetchFullResidentDetails() {
			try {
				// Use the admin API to get full details, or create a specific care-facing API
				const res = await fetch(`/api/admin/residents/${initialResident.id}/profile`);
				if (!res.ok) throw new Error('Failed to fetch full resident details');
				const data = await res.json();
				setResident(data);
			} catch (error) {
				console.error('Error fetching full resident details:', error);
				// Optionally show a toast error
			}
		}
		fetchFullResidentDetails();
	}, [initialResident.id]);

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

			{/* Resident Overview */}
			<div className="bg-white rounded-lg shadow p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 text-sm text-gray-700">
				<div>
					<p>
						<span className="font-medium">Date of Birth:</span>{' '}
						{resident.dateOfBirth}
					</p>
					<p>
						<span className="font-medium">Phone:</span> {resident.phone}
					</p>
					<p>
						<span className="font-medium">Sex:</span> {resident.sex}
					</p>
					<p>
						<span className="font-medium">Placement Date:</span>{' '}
						{resident.placementDate
							? new Date(resident.placementDate).toLocaleDateString()
							: 'N/A'}
					</p>
				</div>
				<div>
					<p>
						<span className="font-medium">Weight:</span> {resident.weight}
					</p>
					<p>
						<span className="font-medium">Height:</span> {resident.height}
					</p>
					<p>
						<span className="font-medium">Hair Color:</span> {resident.hairColor}
					</p>
					<p>
						<span className="font-medium">Support Broker:</span>{' '}
						{resident.supportBroker || 'N/A'}
					</p>
				</div>
				<div>
					<p>
						<span className="font-medium">Funding Agency:</span>{' '}
						{resident.fundingAgency || 'N/A'}
					</p>
					<p>
						<span className="font-medium">Case Manager:</span>{' '}
						{resident.caseManagerName || 'N/A'}
					</p>
					<p className="ml-4">
						<span className="font-medium">Phone:</span>{' '}
						{resident.caseManagerPhone || 'N/A'}
					</p>
					<p className="ml-4">
						<span className="font-medium">Email:</span>{' '}
						{resident.caseManagerEmail || 'N/A'}
					</p>
				</div>

				{(resident.diagnosis || resident.importantRelationships) && (
					<div className="col-span-full border-t pt-4 mt-4">
						{resident.diagnosis && (
							<p className="mt-2">
								<span className="font-medium">Diagnosis:</span>{' '}
								{resident.diagnosis}
							</p>
						)}
						{resident.importantRelationships && (
							<p className="mt-2">
								<span className="font-medium">Important Relationships:</span>{' '}
								{resident.importantRelationships}
							</p>
						)}
					</div>
				)}

				{resident.vocationalAgency && (
					<div className="col-span-full border-t pt-4 mt-4">
						<h4 className="font-medium">Vocational Agency:</h4>
						<p className="mt-1">{resident.vocationalAgency}</p>
						{resident.vocationalAgencyAddress && (
							<p className="text-sm text-gray-600">
								{resident.vocationalAgencyAddress}
							</p>
						)}
					</div>
				)}
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
							// authorName={userName} // No longer needed
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
						<ResidentActivityHistory residentId={resident.id} />
					)}
				</div>
			</div>
		</div>
	);
}
