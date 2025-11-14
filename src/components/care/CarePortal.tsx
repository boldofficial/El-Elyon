'use client';

import React, {useState, useEffect} from 'react';
import {SignOutButton} from '../auth/SignOutButton';
import CareShiftWorkspace from './CareShiftWorkspace';
import CareResidentsWorkspace from './CareResidentsWorkspace';
import CareLogsWorkspace from './CareLogsWorkspace';
import CareProfileWorkspace from './CareProfileWorkspace';
import SupervisorTeamWorkspace from './SupervisorTeamWorkspace';
import SupervisorComplianceWorkspace from './SupervisorComplianceWorkspace';

export default function CarePortal() {
	const [activeView, setActiveView] = useState('shift');
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [currentShift, setCurrentShift] = useState<any>(null);

	useEffect(() => {
		async function fetchData() {
			try {
				const sessionRes = await fetch('/api/access/session');
				const session = await sessionRes.json();
				setSessionInfo(session);

				const shiftRes = await fetch('/api/shifts/current');
				const shift = await shiftRes.json();
				setCurrentShift(shift);
			} catch (error) {
				console.error('Error fetching care portal data:', error);
			}
		}

		fetchData();
	}, []);

	const isSupervisor = sessionInfo?.role === 'supervisor';
	const isClockedIn = !!currentShift;

	const navigationItems = [
		{id: 'shift', label: 'Shift', icon: '⏰', description: 'Clock in/out'},
		{
			id: 'residents',
			label: 'Residents',
			icon: '🏠',
			description: 'Location-scoped list',
		},
		{id: 'logs', label: 'Logs', icon: '📝', description: 'Create & view logs'},
		{
			id: 'profile',
			label: 'My Profile',
			icon: '👤',
			description: 'Credentials & acknowledgments',
		},
	];

	const supervisorItems = [
		{id: 'team', label: 'Team', icon: '👥', description: 'Time exceptions'},
		{
			id: 'compliance',
			label: 'Compliance',
			icon: '📋',
			description: 'ISPs author/publish',
		},
	];

	const handleNavigation = async (viewId: string) => {
		setActiveView(viewId);
		await fetch('/api/access/log', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				activity: 'navigate_care_portal',
				details: `view=${viewId}`,
			}),
		});
	};

	const renderContent = () => {
		if (!isClockedIn) {
			return <CareShiftWorkspace />;
		}
		switch (activeView) {
			case 'shift':
				return <CareShiftWorkspace />;
			case 'residents':
				return <CareResidentsWorkspace />;
			case 'logs':
				return <CareLogsWorkspace />;
			case 'profile':
				return <CareProfileWorkspace />;
			case 'team':
				return isSupervisor ? (
					<SupervisorTeamWorkspace />
				) : (
					<div>Access denied</div>
				);
			case 'compliance':
				return isSupervisor ? (
					<SupervisorComplianceWorkspace />
				) : (
					<div>Access denied</div>
				);
			default:
				return <CareShiftWorkspace />;
		}
	};

	return (
		<div className="flex h-screen bg-gray-50">
			<div className="w-64 bg-white shadow-sm border-r flex flex-col">
				<div className="p-6 border-b">
					<h1 className="text-xl font-bold text-gray-900">Care Portal</h1>
					{sessionInfo?.user && (
						<div className="mt-2 text-sm text-gray-600">
							{sessionInfo.user.name}
							{sessionInfo.role && (
								<span className="ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
									{sessionInfo.role.charAt(0).toUpperCase() +
										sessionInfo.role.slice(1)}
								</span>
							)}
						</div>
					)}
				</div>

				<nav className="flex-1 p-4 space-y-2">
					<div className="space-y-1">
						{navigationItems.map((item) => (
							<button
								key={item.id}
								onClick={() => handleNavigation(item.id)}
								className={`w-full flex items-center px-3 py-3 text-left rounded-lg transition-colors ${
									activeView === item.id
										? 'bg-blue-50 text-blue-700 border border-blue-200'
										: 'text-gray-700 hover:bg-gray-50'
								} ${!isClockedIn && item.id !== 'shift' ? 'opacity-50 cursor-not-allowed' : ''}`}
								disabled={!isClockedIn && item.id !== 'shift'}>
								<span className="text-lg mr-3">{item.icon}</span>
								<div className="flex-1 min-w-0">
									<div className="font-medium">{item.label}</div>
									<div className="text-xs text-gray-500 truncate">
										{item.description}
									</div>
								</div>
							</button>
						))}
					</div>

					{isSupervisor && (
						<div className="pt-4 border-t">
							<div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
								Supervisor Tools
							</div>
							<div className="space-y-1">
								{supervisorItems.map((item) => (
									<button
										key={item.id}
										onClick={() => handleNavigation(item.id)}
										className={`w-full flex items-center px-3 py-3 text-left rounded-lg transition-colors ${
											activeView === item.id
												? 'bg-purple-50 text-purple-700 border border-purple-200'
												: 'text-gray-700 hover:bg-gray-50'
										} ${!isClockedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
										disabled={!isClockedIn}>
										<span className="text-lg mr-3">{item.icon}</span>
										<div className="flex-1 min-w-0">
											<div className="font-medium">{item.label}</div>
											<div className="text-xs text-gray-500 truncate">
												{item.description}
											</div>
										</div>
									</button>
								))}
							</div>
						</div>
					)}
				</nav>

				<div className="p-4 border-t">
					<SignOutButton />
				</div>
			</div>

			<main className="flex-1 overflow-y-auto">
				<div className="p-8">
					{!isClockedIn && (
						<div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 text-center font-medium">
							You must clock in to access the rest of the Care Portal.
						</div>
					)}
					{renderContent()}
				</div>
			</main>
		</div>
	);
}
