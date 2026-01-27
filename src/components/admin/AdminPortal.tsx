'use client';

import React, {useState, useEffect} from 'react';
import {useUser} from '@clerk/nextjs';
import {getDeviceId} from '@/lib/device';
import {SignOutButton} from '../auth/SignOutButton';
import Sidebar from '../shared/Sidebar';
import AdminDashboard from './AdminDashboard';
import PeopleWorkspace from './PeopleWorkspace';
import ComplianceWorkspace from '../compliance/ComplianceWorkspace';
import SettingsWorkspace from './SettingsWorkspace';
import ComplianceAlerts from '../compliance/ComplianceAlerts';
import LocationsWorkspace from './LocationsWorkspace'; // Ensure this is present
import GuardianChecklistWorkspace from '../guardian/GuardianChecklistWorkspace';
import {DataCleanupWorkspace} from './DataCleanupWorkspace';
import DeviceManagementWorkspace from './DeviceManagementWorkspace';
import AdminDeviceBadge from './AdminDeviceBadge';
import EmployeeHRManagement from './EmployeeHRManagement';
import ResidentProfileManagement from './ResidentProfileManagement';
import DocumentsWorkspace from './DocumentsWorkspace';
import CareLogsWorkspace from './CareLogsWorkspace';


export default function AdminPortal() {
	const [activeView, setActiveView] = useState('dashboard');
	const {user: clerkUser} = useUser();
	const [currentUser, setCurrentUser] = useState<any>(null);
	const [deviceCheck, setDeviceCheck] = useState<any>(null);
	const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
	const [selectedResidentId, setSelectedResidentId] = useState<string | null>(null);
	const deviceId = getDeviceId();

	useEffect(() => {
		async function fetchData() {
			try {
				const userRes = await fetch('/api/users/current');
				const userData = await userRes.json();
				setCurrentUser(userData);

				// Device check is optional - only fetch if endpoint is available
				try {
					const deviceRes = await fetch(
						`/api/devices/check?deviceId=${deviceId}`
					);
					
					// Only parse JSON if response is OK and has content
					if (deviceRes.ok && deviceRes.headers.get('content-type')?.includes('application/json')) {
						const deviceData = await deviceRes.json();
						setDeviceCheck(deviceData);
					} else {
						console.warn('Device check endpoint not available or returned invalid response');
						setDeviceCheck(null);
					}
				} catch (deviceError) {
					// Device check is optional, so we don't fail the entire load
					console.warn('Device check failed:', deviceError);
					setDeviceCheck(null);
				}
			} catch (error) {
				console.error('Error fetching admin data:', error);
			}
		}

		fetchData();
	}, [deviceId]);

	const handleNavigate = (view: string, entityId?: string) => {
		setActiveView(view);
		if (view === 'employee-hr' && entityId) {
			setSelectedEmployeeId(entityId);
		} else if (view === 'resident-profile' && entityId) {
			setSelectedResidentId(entityId);
		} else {
			setSelectedEmployeeId(null);
			setSelectedResidentId(null);
		}
	};

	const renderContent = () => {
		if (activeView === 'employee-hr' && selectedEmployeeId) {
			return (
				<div>
					<button
						onClick={() => setActiveView('people')}
						className="mb-4 text-blue-600 hover:underline">
						← Back to People
					</button>
					<EmployeeHRManagement employeeId={selectedEmployeeId} />
				</div>
			);
		}

		if (activeView === 'resident-profile' && selectedResidentId) {
			return (
				<div>
					<button
						onClick={() => setActiveView('people')}
						className="mb-4 text-blue-600 hover:underline">
						← Back to People
					</button>
					<ResidentProfileManagement residentId={selectedResidentId} />
				</div>
			);
		}

		switch (activeView) {
			case 'dashboard':
				return <AdminDashboard onNavigate={handleNavigate} />;
			case 'people':
				return <PeopleWorkspace onNavigate={handleNavigate} />;
			case 'compliance':
				return <ComplianceWorkspace />;
			case 'locations':
				return <LocationsWorkspace />; // Use LocationsWorkspace
			case 'devices':
				return <DeviceManagementWorkspace />;
			case 'guardian-checklists':
				return <GuardianChecklistWorkspace />;
			case 'data-cleanup':
				return <DataCleanupWorkspace />;
			case 'settings':
				return <SettingsWorkspace />;

			case 'documents':
				return <DocumentsWorkspace />;
			case 'care-logs':
				return <CareLogsWorkspace />;
			default:
				return <AdminDashboard onNavigate={handleNavigate} />;
		}
	};

	if (!clerkUser || !currentUser) {
		return (
			<div className="flex items-center justify-center h-screen">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading admin portal...</p>
				</div>
			</div>
		);
	}

	const userForSidebar = {
		name:
			currentUser?.name || clerkUser.fullName || clerkUser.firstName || 'Admin',
		email:
			currentUser?.email || clerkUser.primaryEmailAddress?.emailAddress || '',
		role: currentUser?.role || 'admin',
	};

	return (
		<div className="flex h-screen bg-gray-50">
			<Sidebar
				user={userForSidebar}
				selected={activeView}
				setSelected={setActiveView}
			/>
			<main className="flex-1 overflow-y-auto p-8">
				<div className="flex justify-between items-center mb-8">
					<h1 className="text-3xl font-bold text-gray-900">
						{activeView === 'employee-hr' && 'Employee HR Documents'}
						{activeView === 'resident-profile' && 'Resident Profile'}
						{activeView !== 'employee-hr' && activeView !== 'resident-profile' &&
							activeView.charAt(0).toUpperCase() + activeView.slice(1)}
					</h1>
					<SignOutButton />
				</div>

				{deviceCheck && <AdminDeviceBadge deviceCheck={deviceCheck} />}
				<ComplianceAlerts />
				{renderContent()}
			</main>
		</div>
	);
}
