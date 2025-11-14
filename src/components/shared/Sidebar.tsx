import React from 'react';
import {SignOutButton} from '../SignOutButton';

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
		key: 'devices',
		label: 'Device Management',
		icon: '💻',
	},
	{
		key: 'guardian-checklists',
		label: 'Guardian Checklists',
		icon: '📋',
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
	return (
		<aside className="w-64 bg-white border-r min-h-screen flex flex-col">
			<div className="h-16 flex items-center justify-center border-b px-4">
				{/* Replace the src below with your logo image path */}
				<img
					src="/logo.png"
					alt="Admin Portal Logo"
					className="h-10 w-auto"
					onError={(e) => {
						// Fallback to text if logo image doesn't exist
						e.currentTarget.style.display = 'none';
						e.currentTarget.nextElementSibling?.classList.remove('hidden');
					}}
				/>
				<span className="text-2xl font-bold text-blue-600 hidden">
					Admin Portal
				</span>
			</div>
			<nav
				className="flex-1 py-4"
				role="navigation"
				aria-label="Main navigation">
				<ul className="flex flex-col">
					{NAV_SECTIONS.map((section) => {
						const isActive = selected === section.key;
						return (
							<li key={section.key} className="mb-1">
								<button
									className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg mx-2 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${isActive ? 'bg-blue-100 text-blue-700 font-semibold shadow-sm' : 'hover:bg-gray-100 text-gray-700'}`}
									onClick={() => setSelected(section.key)}>
									<span className="text-lg" aria-hidden="true">
										{section.icon}
									</span>
									<span className="font-medium">{section.label}</span>
								</button>
							</li>
						);
					})}
				</ul>
			</nav>
			<div className="border-t p-4 flex flex-col gap-3">
				{user && (
					<div className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3">
						<div className="font-medium truncate" title={user.email ?? 'User'}>
							{user.email ?? 'User'}
						</div>
						<div className="text-xs text-gray-500 capitalize mt-1">
							{user.role ?? 'No role assigned'}
						</div>
					</div>
				)}
				<SignOutButton />
			</div>
		</aside>
	);
}
