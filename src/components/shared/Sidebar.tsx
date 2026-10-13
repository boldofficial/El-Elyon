import React from 'react';
import {SignOutButton} from '../auth/SignOutButton';
import {useState, useEffect} from 'react';

type NavItem = {key: string; label: string; icon: string};
type NavGroup = {key: string; label: string; icon: string; items: NavItem[]};

const DASHBOARD: NavItem = {key: 'dashboard', label: 'Dashboard', icon: '🏠'};

const NAV_GROUPS: NavGroup[] = [
	{
		key: 'people',
		label: 'People',
		icon: '👥',
		items: [
			{key: 'people', label: 'Residents & Staff', icon: '👤'},
			{key: 'staff-directory', label: 'Staff Directory', icon: '🗂️'},
			{key: 'vacation-requests', label: 'Vacation Requests', icon: '🏖️'},
			{key: 'memos', label: 'Memos', icon: '✉️'},
		],
	},
	{
		key: 'care-safety',
		label: 'Care & Safety',
		icon: '🩺',
		items: [
			{key: 'care-logs', label: 'Logs & Incidents', icon: '📋'},
			{key: 'documents', label: 'Life-Safety Reports', icon: '🧯'},
			{key: 'water-temperature', label: 'Water Temperature', icon: '🌡️'},
			{key: 'guardian-checklists', label: 'Guardian Checklists', icon: '🛡️'},
		],
	},
	{
		key: 'compliance',
		label: 'Compliance',
		icon: '✅',
		items: [
			{key: 'compliance', label: 'Compliance', icon: '✅'},
			{key: 'inspector-access', label: 'State Inspector Access', icon: '🛂'},
		],
	},
	{
		key: 'administration',
		label: 'Administration',
		icon: '🛠️',
		items: [
			{key: 'locations', label: 'Locations', icon: '📍'},
			{key: 'devices', label: 'Device Management', icon: '💻'},
			{key: 'admin-privileges', label: 'Admin Privileges', icon: '🔑'},
			{key: 'data-cleanup', label: 'Data Cleanup', icon: '🧹'},
			{key: 'settings', label: 'Settings', icon: '🔐'},
		],
	},
];

// Detail views opened from inside a workspace, mapped to the nav item they
// belong to so the right group stays open and highlighted.
const DETAIL_VIEW_PARENT: Record<string, string> = {
	'employee-hr': 'people',
	'resident-profile': 'people',
};

const NAV_LABELS: Record<string, string> = {
	[DASHBOARD.key]: DASHBOARD.label,
	'employee-hr': 'Employee HR Documents',
	'resident-profile': 'Resident Profile',
	...Object.fromEntries(
		NAV_GROUPS.flatMap((group) => group.items.map((item) => [item.key, item.label]))
	),
};

export function getNavLabel(view: string): string {
	return NAV_LABELS[view] ?? view.charAt(0).toUpperCase() + view.slice(1);
}

function groupKeyFor(view: string): string | undefined {
	const navKey = DETAIL_VIEW_PARENT[view] ?? view;
	return NAV_GROUPS.find((group) => group.items.some((item) => item.key === navKey))?.key;
}

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
	const activeGroup = groupKeyFor(selected);
	const activeNavKey = DETAIL_VIEW_PARENT[selected] ?? selected;
	const [openGroups, setOpenGroups] = useState<Set<string>>(
		() => new Set(activeGroup ? [activeGroup] : [])
	);

	// Whenever navigation lands in a group (including from dashboard
	// shortcuts), make sure that group is open.
	useEffect(() => {
		if (!activeGroup) return;
		setOpenGroups((prev) =>
			prev.has(activeGroup) ? prev : new Set(prev).add(activeGroup)
		);
	}, [activeGroup]);

	const toggleGroup = (key: string) => {
		setOpenGroups((prev) => {
			const next = new Set(prev);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	};

	const badgeFor = (key: string) =>
		key === 'vacation-requests' ? pendingVacationCount : 0;

	const renderItem = (item: NavItem, nested: boolean) => {
		const isActive = activeNavKey === item.key;
		const badge = badgeFor(item.key);
		return (
			<li key={item.key}>
				<button
					className={`w-full flex items-center gap-3 ${nested ? 'pl-9 pr-4 py-2 text-sm' : 'px-4 py-3'} text-left rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#1e3a5f] ${
						isActive
							? 'text-white font-semibold'
							: 'text-blue-200 hover:bg-white/10'
					}`}
					style={isActive ? {backgroundColor: '#3b82f6'} : {}}
					aria-current={isActive ? 'page' : undefined}
					onClick={() => setSelected(item.key)}>
					<span className={nested ? 'text-base' : 'text-lg'} aria-hidden="true">
						{item.icon}
					</span>
					<span className="font-medium flex-1">{item.label}</span>
					{badge > 0 && (
						<span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
							{badge}
						</span>
					)}
				</button>
			</li>
		);
	};

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
					{renderItem(DASHBOARD, false)}
					{NAV_GROUPS.map((group) => {
						const isOpen = openGroups.has(group.key);
						const containsActive = activeGroup === group.key;
						const groupBadge = group.items.reduce(
							(sum, item) => sum + badgeFor(item.key),
							0
						);
						const panelId = `nav-group-${group.key}`;
						return (
							<li key={`group-${group.key}`}>
								<button
									className={`w-full flex items-center gap-3 px-4 py-3 text-left rounded-lg transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-[#1e3a5f] hover:bg-white/10 ${
										containsActive ? 'text-white' : 'text-blue-200'
									} ${containsActive && !isOpen ? 'bg-white/10' : ''}`}
									aria-expanded={isOpen}
									aria-controls={panelId}
									onClick={() => toggleGroup(group.key)}>
									<span className="text-lg" aria-hidden="true">
										{group.icon}
									</span>
									<span className="font-semibold flex-1">{group.label}</span>
									{!isOpen && groupBadge > 0 && (
										<span className="bg-red-500 text-white text-xs font-bold px-2 py-1 rounded-full">
											{groupBadge}
										</span>
									)}
									<span
										className={`text-xs transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
										aria-hidden="true">
										▶
									</span>
								</button>
								{isOpen && (
									<ul id={panelId} className="mt-1 space-y-1">
										{group.items.map((item) => renderItem(item, true))}
									</ul>
								)}
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
