import React from 'react';
import {SignOutButton} from '../auth/SignOutButton';
import {useState, useEffect} from 'react';

const NAV_SECTIONS = [
	{
		key: 'dashboard',
		label: 'Dashboard',
		icon: '🏠',
	},
	{
		key: 'compliance',
		label: 'Compliance',
		icon: '✅',
	},
	{
		key: 'people',
		label: 'People',
		icon: '👤',
	},
	{
		key: 'locations',
		label: 'Locations',
		icon: '📍',
	},
	{
		key: 'memos',
		label: 'Memos',
		icon: '✉️',
	},
	{
		key: 'vacation-requests',
		label: 'Vacation Requests',
		icon: '🏖️',
	},
	{
		key: 'documents',
		label: 'Fire Drill & Smoke Detector',
		icon: '🧯',
	},
	{
		key: 'care-logs',
		label: 'Logs & Incidents',
		icon: '📋',
	},
	{
		key: 'devices',
		label: 'Device Management',
		icon: '💻',
	},
	{
		key: 'admin-privileges',
		label: 'Admin Privileges',
		icon: '🔑',
	},
	{
		key: 'guardian-checklists',
		label: 'Guardian Checklists',
		icon: '📋',
	},
	{
		key: 'inspector-access',
		label: 'State Inspector Access',
		icon: '🛂',
	},
	{
		key: 'data-cleanup',
		label: 'Data Cleanup',
		icon: '🧹',
	},
	{
		key: 'settings',
		label: 'Settings',
		icon: '🔐',
	},
];

export default function Sidebar({
	user,
	selected,
	setSelected,
}: {
	user: any;
	selected: string;
	setSelected: (key: string) => void;
}) {
	const [pendingVacationCount, setPendingVacationCount] = useState(0);

	useEffect(() => {
		fetchPendingCount();
		const interval = setInterval(fetchPendingCount, 60000); // Poll every minute
		return () => clearInterval(interval);
	}, []);

	const fetchPendingCount = async () => {
		try {
			const res = await fetch('/api/vacation-requests/pending-count');
			if (res.ok) {
				const data = await res.json();
				setPendingVacationCount(data.count);
			}
		} catch (error) {
			console.error('Error fetching pending vacation count:', error);
		}
	};

	return (
		<aside className="w-64 min-h-screen flex flex-col" style={{backgroundColor: '#1e3a5f'}}>
			{/* Header with Logo/Title */}
			<div className="h-16 flex items-center justify-center border-b border-white/10 px-4">
				<span className="text-2xl font-bold text-white ">
					Admin Portal
				</span>
			</div>

			{/* User Info Section */}
			{user && (
				<div className="p-4 border-b border-white/10">
					<p className="text-sm text-blue-200 truncate" title={user.email ?? 'User'}>
						{user.email ?? 'User'}
					</p>
					{user.role && (
						<span 
							className="mt-2 inline-flex items-center px-3 py-1 rounded text-xs font-semibold text-white"
							style={{backgroundColor: '#20a39e'}}
						>
							{user.role.charAt(0).toUpperCase() + user.role.slice(1)}
						</span>
					)}
				</div>
			)}

			{/* Navigation */}
			<nav
				className="flex-1 py-4 overflow-y-auto"
				role="navigation"
				aria-label="Main navigation">
				<ul className="flex flex-col px-2 space-y-1">
					{NAV_SECTIONS.map((section) => {
						const isActive = selected === section.key;
						const showBadge = section.key === 'vacation-requests' && pendingVacationCount > 0;
						return (
							<li key={section.key}>
								<button
									className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#1e3a5f] ${
										isActive 
											? 'text-white font-semibold' 
											: 'text-blue-200 hover:bg-white/10'
									}`}
									style={isActive ? {backgroundColor: '#3b82f6'} : {}}
									onClick={() => setSelected(section.key)}>
									<span className="text-lg" aria-hidden="true">
										{section.icon}
									</span>
									<span className="font-medium flex-1">{section.label}</span>
									{showBadge && (
										<span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
											{pendingVacationCount}
										</span>
									)}
								</button>
							</li>
						);
					})}
				</ul>
			</nav>

			{/* Sign Out Button */}
			<div className="p-4 border-t border-white/10">
				<SignOutButton />
			</div>
		</aside>
	);
}
