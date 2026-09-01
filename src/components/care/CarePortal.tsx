// src/components/care/CarePortal.tsx

'use client';

import React, {useState, useEffect, useCallback, useMemo, useRef} from 'react';
import {SignOutButton} from '../auth/SignOutButton';
import CareShiftWorkspace from './CareShiftWorkspace';
import WaterTemperatureReminder, {WaterTemperatureNavBadge} from './WaterTemperatureReminder';
import WaterTemperatureEntryDialog from './WaterTemperatureEntryDialog';
import type {WaterTemperatureStatus} from '@/db/queries/water-temperature';
import {
	WATER_TEMPERATURE_POLL_INTERVAL_MS,
	canOpenWaterTemperatureEntry,
	isWaterTemperatureEntryStale,
	mapStatusFetchResult,
	shouldApplyStatusResponse,
	shouldPollWaterTemperatureStatus,
	toWaterTemperatureShiftIdentity,
	type StatusFetchResult,
	type WaterTemperatureShiftIdentity,
} from './waterTemperatureEntryModel';
import CareResidentsWorkspace from './CareResidentsWorkspace';
import CareProfileWorkspace from './CareProfileWorkspace';
import SupervisorComplianceWorkspace from '../supervisor/SupervisorComplianceWorkspace';
import SupervisorTeamWorkspace from '../supervisor/SupervisorTeamWorkspace';
import SupervisorShiftHistory from '../supervisor/SupervisorShiftHistory';
import CarePortalResidentDetails from './CarePortalResidentDetails';
import LifeSafetyDocuments from '../supervisor/LifeSafetyDocuments';
import WaterTemperatureWorkspace from '../supervisor/WaterTemperatureWorkspace';
import MemosWorkspace from '../shared/MemosWorkspace';
import VacationRequests from '../shared/VacationRequests';
import PeopleWorkspace from '../admin/PeopleWorkspace';
import LocationsWorkspace from '../admin/LocationsWorkspace';
import DeviceManagementWorkspace from '../admin/DeviceManagementWorkspace';
import ComplianceWorkspace from '../compliance/ComplianceWorkspace';
import GuardianChecklistWorkspace from '../guardian/GuardianChecklistWorkspace';
import {DataCleanupWorkspace} from '../admin/DataCleanupWorkspace';
import SettingsWorkspace from '../admin/SettingsWorkspace';
import AdminCareLogsWorkspace from '../admin/CareLogsWorkspace';

type AdminPrivilege =
	| 'manage_employees'
	| 'manage_residents'
	| 'manage_locations'
	| 'manage_devices'
	| 'manage_compliance'
	| 'manage_memos'
	| 'manage_vacation_requests'
	| 'manage_documents'
	| 'view_care_logs'
	| 'manage_guardian_checklists'
	| 'manage_data_cleanup'
	| 'manage_settings';

const PRIVILEGE_TO_VIEW: Record<AdminPrivilege, string> = {
	manage_employees: 'manage-people',
	manage_residents: 'manage-people',
	manage_locations: 'manage-locations',
	manage_devices: 'manage-devices',
	manage_compliance: 'manage-compliance',
	manage_memos: 'memos',
	manage_vacation_requests: 'vacation',
	manage_documents: 'life-safety',
	view_care_logs: 'manage-care-logs',
	manage_guardian_checklists: 'manage-guardian-checklists',
	manage_data_cleanup: 'manage-data-cleanup',
	manage_settings: 'manage-settings',
};

const MANAGEMENT_VIEW_LABELS: Record<string, {label: string; icon: string; description: string}> = {
	'manage-people': {
		label: 'People Management',
		icon: '👥',
		description: 'Residents, guardians, employees',
	},
	'manage-locations': {
		label: 'Locations',
		icon: '📍',
		description: 'Manage homes',
	},
	'manage-devices': {
		label: 'Devices',
		icon: '💻',
		description: 'Register and update devices',
	},
	'manage-compliance': {
		label: 'Compliance',
		icon: '✅',
		description: 'Compliance overview',
	},
	'manage-care-logs': {
		label: 'Logs & Incidents',
		icon: '📋',
		description: 'Review care records',
	},
	'manage-guardian-checklists': {
		label: 'Guardian Checklists',
		icon: '📋',
		description: 'Templates and links',
	},
	'manage-data-cleanup': {
		label: 'Data Cleanup',
		icon: '🧹',
		description: 'Maintenance tools',
	},
	'manage-settings': {
		label: 'Settings',
		icon: '🔐',
		description: 'System settings',
	},
};

export default function CarePortal() {
	const [activeView, setActiveView] = useState('shift');
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [currentShift, setCurrentShift] = useState<any>(null);
	const [selectedResident, setSelectedResident] = useState<any>(null);
	const [unreadMemoCount, setUnreadMemoCount] = useState(0);
	const adminPrivileges = (sessionInfo?.adminPrivileges || []) as AdminPrivilege[];
	const delegatedManagementViews = Array.from(
		new Set(
			adminPrivileges
				.map((privilege) => PRIVILEGE_TO_VIEW[privilege])
				.filter((viewId) => Boolean(MANAGEMENT_VIEW_LABELS[viewId]))
		)
	);

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

	// ------------------------------------------------------------------
	// Water-temperature obligation (U4). Every decision below -- which
	// banner/badge to render, whether a response is stale, whether polling
	// should run -- lives in ./waterTemperatureEntryModel and is tested in
	// waterTemperatureEntryModel.test.ts. This block owns only the effects.
	// ------------------------------------------------------------------
	const waterIdentity = useMemo(
		() => toWaterTemperatureShiftIdentity(currentShift),
		[currentShift]
	);
	const waterIdentityKey = waterIdentity
		? `${waterIdentity.shiftId}|${waterIdentity.locationId}|${waterIdentity.shiftSlot}|${waterIdentity.operationalDate}`
		: '';

	const [waterStatus, setWaterStatus] = useState<WaterTemperatureStatus>('no_shift');
	const [isWaterStatusRefreshing, setIsWaterStatusRefreshing] = useState(false);
	const [waterEntryIdentity, setWaterEntryIdentity] =
		useState<WaterTemperatureShiftIdentity | null>(null);

	// A monotonic request generation plus the identity each request was
	// issued for. Both must still match when a response lands, so a slow
	// reply from a previous house/shift can never paint the current one.
	const waterGenerationRef = useRef(0);
	const waterAbortRef = useRef<AbortController | null>(null);
	const waterIdentityRef = useRef<WaterTemperatureShiftIdentity | null>(null);

	const refreshWaterStatus = useCallback(async () => {
		const requestIdentity = waterIdentityRef.current;
		if (!requestIdentity) {
			setWaterStatus('no_shift');
			return;
		}

		waterAbortRef.current?.abort();
		const controller = new AbortController();
		waterAbortRef.current = controller;
		waterGenerationRef.current += 1;
		const requestGeneration = waterGenerationRef.current;
		setIsWaterStatusRefreshing(true);

		let result: StatusFetchResult;
		try {
			const response = await fetch('/api/care/water-temperature-status', {
				cache: 'no-store',
				signal: controller.signal,
			});
			const body = await response.json().catch(() => null);
			result = {kind: 'response', httpStatus: response.status, body};
		} catch {
			// An abort is a superseded request, not a verification failure:
			// leave the current status alone for the newer request to set.
			if (controller.signal.aborted) return;
			result = {kind: 'failure'};
		}

		if (
			!shouldApplyStatusResponse({
				requestGeneration,
				currentGeneration: waterGenerationRef.current,
				requestIdentity,
				currentIdentity: waterIdentityRef.current,
			})
		) {
			return;
		}

		setIsWaterStatusRefreshing(false);
		setWaterStatus(mapStatusFetchResult(result));
	}, []);

	// Identity changes (bootstrap, normal/selfie clock-in, legacy-shift
	// classification, clock-out) invalidate in-flight requests and trigger
	// an immediate authoritative refresh.
	useEffect(() => {
		waterIdentityRef.current = waterIdentity;
		waterGenerationRef.current += 1;
		waterAbortRef.current?.abort();
		waterAbortRef.current = null;
		setIsWaterStatusRefreshing(false);
		if (!waterIdentity) {
			setWaterStatus('no_shift');
			setWaterEntryIdentity(null);
			return;
		}
		void refreshWaterStatus();
		// waterIdentity is recomputed on every currentShift refetch; the
		// stable key keeps this to one refresh per real identity change.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [waterIdentityKey, refreshWaterStatus]);

	// Refresh whenever the app is refocused or becomes visible again, so a
	// colleague completing the shared obligation clears this worker's banner.
	useEffect(() => {
		const refreshIfActive = () => {
			if (waterIdentityRef.current) void refreshWaterStatus();
		};
		const handleVisibility = () => {
			if (!document.hidden) refreshIfActive();
		};
		window.addEventListener('focus', refreshIfActive);
		document.addEventListener('visibilitychange', handleVisibility);
		return () => {
			window.removeEventListener('focus', refreshIfActive);
			document.removeEventListener('visibilitychange', handleVisibility);
		};
	}, [refreshWaterStatus]);

	// Bounded poll: only while clocked in and only while the tab is visible.
	useEffect(() => {
		if (!waterIdentityKey) return;
		const interval = setInterval(() => {
			if (
				shouldPollWaterTemperatureStatus({
					identity: waterIdentityRef.current,
					documentHidden: document.hidden,
				})
			) {
				void refreshWaterStatus();
			}
		}, WATER_TEMPERATURE_POLL_INTERVAL_MS);
		return () => clearInterval(interval);
	}, [waterIdentityKey, refreshWaterStatus]);

	useEffect(() => () => waterAbortRef.current?.abort(), []);

	// An editor opened for a house/shift that is no longer current is not
	// rendered at all, so it can never submit against the prior obligation.
	const activeWaterEntryIdentity =
		waterEntryIdentity &&
		!isWaterTemperatureEntryStale({
			openedForIdentity: waterEntryIdentity,
			currentIdentity: waterIdentity,
		})
			? waterIdentity
			: null;

	const openWaterEntry = () => {
		if (!canOpenWaterTemperatureEntry({identity: waterIdentity, status: waterStatus})) return;
		setWaterEntryIdentity(waterIdentity);
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
			label: 'Life-Safety Reports',
			icon: '🧯',
			description: 'Annual inspections & fire drills',
		},
		{
			id: 'water-temperature',
			label: 'Water Temperature',
			icon: '🌡️',
			description: 'Daily check log',
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

	const delegatedItems = delegatedManagementViews.map((viewId) => ({
		id: viewId,
		...MANAGEMENT_VIEW_LABELS[viewId],
	}));

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
			return <CareShiftWorkspace onShiftChange={refetchShift} waterTemperatureStatus={waterStatus} />;
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
				return <CareShiftWorkspace onShiftChange={refetchShift} waterTemperatureStatus={waterStatus} />;
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
			// Staff get the read-only guidance panel; the current-shift entry
			// action stays on U4's persistent reminder banner. Supervisors and
			// delegated document managers additionally get the month grid,
			// summary counts, print, and audit controls. The server enforces
			// the same boundary independently (R11/R18).
			case 'water-temperature':
				return (
					<WaterTemperatureWorkspace
						canManage={isSupervisor || adminPrivileges.includes('manage_documents')}
					/>
				);
			case 'profile':
				return <CareProfileWorkspace />;
			case 'manage-people':
				return (
					<PeopleWorkspace
						allowedTabs={[
							...(adminPrivileges.includes('manage_residents')
								? (['residents', 'guardians'] as const)
								: []),
							...(adminPrivileges.includes('manage_employees')
								? (['employees'] as const)
								: []),
						]}
					/>
				);
			case 'manage-locations':
				return <LocationsWorkspace />;
			case 'manage-devices':
				return <DeviceManagementWorkspace />;
			case 'manage-compliance':
				return <ComplianceWorkspace />;
			case 'manage-care-logs':
				return <AdminCareLogsWorkspace />;
			case 'manage-guardian-checklists':
				return <GuardianChecklistWorkspace />;
			case 'manage-data-cleanup':
				return <DataCleanupWorkspace />;
			case 'manage-settings':
				return <SettingsWorkspace />;
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
				return (
					<CareShiftWorkspace
						onShiftChange={refetchShift}
						waterTemperatureStatus={waterStatus}
					/>
				);
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
									{/* The water-temperature obligation stays visible from
									    every portal view, not just the Shift workspace. */}
									{item.id === 'shift' && (
										<WaterTemperatureNavBadge status={waterStatus} />
									)}
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

					{delegatedItems.length > 0 && (
						<div className="pt-4 mt-4 border-t border-white/10">
							<div className="text-xs font-semibold text-blue-300 uppercase tracking-wider mb-3 px-3">
								Management Tools
							</div>
							{delegatedItems.map((item) => (
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
					{/* Non-dismissible and above the portal content, so the
					    obligation is present in every view (R8/KTD5). */}
					<WaterTemperatureReminder
						status={waterStatus}
						isRefreshing={isWaterStatusRefreshing}
						onOpen={openWaterEntry}
						onRetry={() => void refreshWaterStatus()}
					/>
					{renderContent()}
				</div>
			</main>

			{activeWaterEntryIdentity && (
				<WaterTemperatureEntryDialog
					identity={activeWaterEntryIdentity}
					status={waterStatus}
					sessionUserName={sessionInfo?.user?.name}
					onMutated={() => void refreshWaterStatus()}
					onClose={() => setWaterEntryIdentity(null)}
				/>
			)}
		</div>
	);
}
