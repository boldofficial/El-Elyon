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
import LocationsWorkspace from './LocationsWorkspace';
import GuardianChecklistWorkspace from '../guardian/GuardianChecklistWorkspace';
import {DataCleanupWorkspace} from './DataCleanupWorkspace';
import DeviceManagementWorkspace from './DeviceManagementWorkspace';
import AdminDeviceBadge from './AdminDeviceBadge';

export default function AdminPortal() {
	const [activeView, setActiveView] = useState('dashboard');
	const {user: clerkUser} = useUser();
	const [currentUser, setCurrentUser] = useState<any>(null);
	const [deviceCheck, setDeviceCheck] = useState<any>(null);
	const deviceId = getDeviceId();

	useEffect(() => {
		async function fetchData() {
			try {
				const userRes = await fetch('/api/users/current');
				const userData = await userRes.json();
				setCurrentUser(userData);

				const deviceRes = await fetch(
					`/api/devices/check?deviceId=${deviceId}`
				);
				const deviceData = await deviceRes.json();
				setDeviceCheck(deviceData);
			} catch (error) {
				console.error('Error fetching admin data:', error);
			}
		}

		fetchData();
	}, [deviceId]);

	const renderContent = () => {
		switch (activeView) {
			case 'dashboard':
				return <AdminDashboard onNavigate={setActiveView} />;
			case 'people':
				return <PeopleWorkspace />;
			case 'compliance':
				return <ComplianceWorkspace />;
			case 'locations':
				return <LocationsWorkspace />;
			case 'devices':
				return <DeviceManagementWorkspace />;
			case 'guardian-checklists':
				return <GuardianChecklistWorkspace />;
			case 'data-cleanup':
				return <DataCleanupWorkspace />;
			case 'settings':
				return <SettingsWorkspace />;
			default:
				return <AdminDashboard onNavigate={setActiveView} />;
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
						{activeView.charAt(0).toUpperCase() + activeView.slice(1)}
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
