// src/components/care/CarePortal.tsx

'use client';

import React, {useState, useEffect} from 'react';
import {SignOutButton} from '../auth/SignOutButton';
import CareShiftWorkspace from './CareShiftWorkspace';
import CareResidentsWorkspace from './CareResidentsWorkspace';
import CareProfileWorkspace from './CareProfileWorkspace';
import SupervisorComplianceWorkspace from '../supervisor/SupervisorComplianceWorkspace';
import SupervisorTeamWorkspace from '../supervisor/SupervisorTeamWorkspace';
import SupervisorShiftHistory from '../supervisor/SupervisorShiftHistory';
import CarePortalResidentDetails from './CarePortalResidentDetails';
import LifeSafetyDocuments from '../supervisor/LifeSafetyDocuments';
import MemosWorkspace from '../shared/MemosWorkspace';
import VacationRequests from '../shared/VacationRequests';

export default function CarePortal() {
	const [activeView, setActiveView] = useState('shift');
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [currentShift, setCurrentShift] = useState<any>(null);
	const [selectedResident, setSelectedResident] = useState<any>(null);
	const [unreadMemoCount, setUnreadMemoCount] = useState(0);

	// Refetch shift data - called after clock-in/out
	const refetchShift = async () => {
		try {
			const shiftRes = await fetch('/api/shifts/current');
			const shift = await shiftRes.json();
			setCurrentShift(shift);
		} catch (error) {
			console.error('Error fetching shift:', error);
		}
	};

	const fetchUnreadCount = async () => {
		try {
			const res = await fetch('/api/memos/unread-count');
			if (res.ok) {
				const data = await res.json();
				setUnreadMemoCount(data.unreadCount);
			}
		} catch (error) {
			console.error('Error fetching unread memo count:', error);
		}
	};

	useEffect(() => {
		async function fetchData() {
			try {
				const sessionRes = await fetch('/api/access/session');
				const session = await sessionRes.json();
				setSessionInfo(session);

				await refetchShift();
				await fetchUnreadCount();
			} catch (error) {
				console.error('Error fetching care portal data:', error);
			}
		}

		fetchData();
	}, []);

	// Poll for unread memos every 30 seconds
	useEffect(() => {
		const interval = setInterval(fetchUnreadCount, 30000);
		return () => clearInterval(interval);
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
		{
			id: 'memos',
			label: 'Memos',
			icon: '✉️',
			description: 'Team communication',
			hasNotification: unreadMemoCount > 0,
			badge: unreadMemoCount > 0 ? unreadMemoCount : undefined,
		},
		{
			id: 'vacation',
			label: 'Vacation Requests',
			icon: '🏖️',
			description: 'Request time off',
		},
		{
			id: 'life-safety',
			label: 'Fire Drill & Smoke Detector',
			icon: '🧯',
			description: 'Monthly checks & drills',
		},
		{
			id: 'profile',
			label: 'My Profile',
			icon: '👤',
			description: 'Credentials & acknowledgm...',
		},
	];

	const supervisorItems = [
		{id: 'team', label: 'Team', icon: '👥', description: 'Time exceptions'},
		{
			id: 'shift-history',
			label: 'Shift History',
			icon: '🗂️',
			description: 'Shifts by day',
		},
		{
			id: 'compliance',
			label: 'Compliance',
			icon: '📋',
			description: 'ISPs author/publish',
		},
	];

	const handleNavigation = async (viewId: string) => {
		setActiveView(viewId);
		setSelectedResident(null);
		await fetch('/api/access/log', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({
				activity: 'navigate_care_portal',
				details: `view=${viewId}`,
			}),
		});
	};

	const handleResidentSelect = (resident: any) => {
		setSelectedResident(resident);
		setActiveView('resident-details');
	};

	const renderContent = () => {
		if (!isClockedIn) {
			return <CareShiftWorkspace onShiftChange={refetchShift} />;
		}

		if (activeView === 'resident-details' && selectedResident) {
			return (
				<div>
					<button
						onClick={() => {
							setSelectedResident(null);
							setActiveView('residents');
						}}
						className="mb-4 px-4 py-2 text-blue-600 hover:bg-blue-50 rounded border border-blue-200">
						← Back to Residents
					</button>
					<CarePortalResidentDetails
						resident={selectedResident}
						userLocation={currentShift?.location || ''}
						userName={sessionInfo?.user?.name || 'Staff'}
						shiftId={currentShift?.id}
					/>
				</div>
			);
		}

		switch (activeView) {
			case 'shift':
				return <CareShiftWorkspace onShiftChange={refetchShift} />;
			case 'residents':
				return (
					<CareResidentsWorkspace onResidentSelect={handleResidentSelect} />
				);
			case 'memos':
				return <MemosWorkspace />;
			case 'vacation':
				return <VacationRequests isAdmin={false} />;
			case 'life-safety':
				return <LifeSafetyDocuments />;
			case 'profile':
				return <CareProfileWorkspace />;
			case 'team':
				return isSupervisor ? (
					<SupervisorTeamWorkspace />
				) : (
					<div>Access denied</div>
				);
			case 'shift-history':
				return isSupervisor ? (
					<SupervisorShiftHistory />
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
			{/* Dark Navy Sidebar */}
			<div className="w-64 flex flex-col" style={{backgroundColor: '#1e3a5f'}}>
				{/* Header with title, email, and role badge */}
				<div className="p-6 border-b border-white/10">
					<h1 className="text-xl font-bold text-white">Care Portal</h1>
					{sessionInfo?.user && (
						<div className="mt-2">
							<p className="text-sm text-blue-200 truncate">
								{sessionInfo.user.email || sessionInfo.user.name}
							</p>
							{sessionInfo.role && (
								<span 
									className="mt-2 inline-flex items-center px-3 py-1 rounded text-xs font-semibold text-white"
									style={{backgroundColor: '#20a39e'}}
								>
									{sessionInfo.role.charAt(0).toUpperCase() + sessionInfo.role.slice(1)}
								</span>
							)}
						</div>
					)}
				</div>

				{/* Navigation */}
				<nav className="flex-1 p-4 space-y-1 overflow-y-auto">
					{navigationItems.map((item) => (
						<button
							key={item.id}
							onClick={() => handleNavigation(item.id)}
							className={`w-full flex items-center px-3 py-3 text-left rounded-lg transition-all ${
								activeView === item.id
									? 'text-white'
									: 'text-blue-200 hover:bg-white/10'
							} ${!isClockedIn && item.id !== 'shift' ? 'opacity-50 cursor-not-allowed' : ''}`}
							style={activeView === item.id ? {backgroundColor: '#3b82f6'} : {}}
							disabled={!isClockedIn && item.id !== 'shift'}>
							<span className="text-lg mr-3">{item.icon}</span>
							<div className="flex-1 min-w-0">
								<div className="font-medium flex items-center">
									{item.label}
									{item.badge && (
										<span className="ml-2 px-2 py-0.5 text-xs bg-red-500 text-white rounded-full">
											{item.badge}
										</span>
									)}
									{item.hasNotification && !item.badge && (
										<span className="ml-2 w-2.5 h-2.5 bg-red-500 rounded-full"></span>
									)}
								</div>
								<div className={`text-xs truncate ${activeView === item.id ? 'text-blue-100' : 'text-blue-300'}`}>
									{item.description}
								</div>
							</div>
						</button>
					))}

					{/* Supervisor Tools Section */}
					{isSupervisor && (
						<div className="pt-4 mt-4 border-t border-white/10">
							<div className="text-xs font-semibold text-blue-300 uppercase tracking-wider mb-3 px-3">
								Supervisor Tools
							</div>
							{supervisorItems.map((item) => (
								<button
									key={item.id}
									onClick={() => handleNavigation(item.id)}
									className={`w-full flex items-center px-3 py-3 text-left rounded-lg transition-all ${
										activeView === item.id
											? 'text-white'
											: 'text-blue-200 hover:bg-white/10'
									} ${!isClockedIn ? 'opacity-50 cursor-not-allowed' : ''}`}
									style={activeView === item.id ? {backgroundColor: '#3b82f6'} : {}}
									disabled={!isClockedIn}>
									<span className="text-lg mr-3">{item.icon}</span>
									<div className="flex-1 min-w-0">
										<div className="font-medium">{item.label}</div>
										<div className={`text-xs truncate ${activeView === item.id ? 'text-blue-100' : 'text-blue-300'}`}>
											{item.description}
										</div>
									</div>
								</button>
							))}
						</div>
					)}
				</nav>

				{/* Sign Out Button */}
				<div className="p-4 border-t border-white/10">
					<SignOutButton  />
				</div>
			</div>

			{/* Main Content */}
			<main className="flex-1 overflow-y-auto">
				<div className="p-8">
					{!isClockedIn && (
						<div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800 text-center font-medium">
							You must clock in to access the rest of the Care Portal.
						</div>
					)}
					{renderContent()}
				</div>
			</main>
		</div>
	);
}
