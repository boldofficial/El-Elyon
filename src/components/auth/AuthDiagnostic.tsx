import {useEffect, useState} from 'react';
import {toast} from 'sonner';

interface AdminUser {
	userId: string;
	role: string;
	locations?: string[];
}

export default function AuthDiagnostic() {
	const [needsBootstrap, setNeedsBootstrap] = useState<boolean | undefined>(
		undefined
	);
	const [admins, setAdmins] = useState<AdminUser[] | undefined>(undefined);
	const [loadingBootstrap, setLoadingBootstrap] = useState(true);
	const [loadingAdmins, setLoadingAdmins] = useState(true);
	const [showDetails, setShowDetails] = useState(false);

	useEffect(() => {
		const fetchNeedsBootstrap = async () => {
			try {
				const response = await fetch('/api/admin/has-admin');
				if (!response.ok) {
					throw new Error('Failed to fetch bootstrap status');
				}
				const data = await response.json();
				setNeedsBootstrap(!data.hasAdmin); // hasAdmin is true if admin exists, so needsBootstrap is false
			} catch (error) {
				console.error('Error fetching bootstrap status:', error);
				toast.error('Failed to load bootstrap status.');
				setNeedsBootstrap(undefined); // Indicate an error or unknown state
			} finally {
				setLoadingBootstrap(false);
			}
		};

		const fetchAdmins = async () => {
			try {
				const response = await fetch('/api/admin/users-with-roles');
				if (!response.ok) {
					throw new Error('Failed to fetch admins');
				}
				const data = await response.json();
				// Assuming data.users is an array of users, and we need to filter for admins
				const adminUsers: AdminUser[] = data.users
					.filter((user: any) => user.role === 'admin')
					.map((user: any) => ({
						userId: user.clerkUserId, // Assuming clerkUserId is the user ID
						role: user.role,
						locations: user.locations, // Assuming locations might be part of the user object
					}));
				setAdmins(adminUsers);
			} catch (error) {
				console.error('Error fetching admins:', error);
				toast.error('Failed to load admin list.');
				setAdmins(undefined); // Indicate an error or unknown state
			} finally {
				setLoadingAdmins(false);
			}
		};

		fetchNeedsBootstrap();
		fetchAdmins();
	}, []);

	const handleForceRefresh = () => {
		toast.info('Refreshing page...');
		window.location.reload();
	};

	return (
		<div className="w-full min-h-screen bg-gray-100 dark:bg-neutral-950 px-4 py-10 flex items-center justify-center">
			<div className="mx-auto w-full max-w-[600px] bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 rounded-2xl shadow-lg p-8">
				<h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
					🔍 Authentication Diagnostic
				</h1>

				<div className="space-y-4">
					{/* Bootstrap Status */}
					<div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
						<div className="flex items-center justify-between mb-2">
							<span className="font-medium text-blue-900 dark:text-blue-200">
								Needs Bootstrap:
							</span>
							<span
								className={`px-3 py-1 rounded-full text-sm font-semibold ${
									needsBootstrap
										? 'bg-yellow-100 text-yellow-800'
										: 'bg-green-100 text-green-800'
								}`}>
								{loadingBootstrap
									? 'Loading...'
									: needsBootstrap === undefined
										? 'Error'
										: needsBootstrap.toString()}
							</span>
						</div>
						<p className="text-sm text-blue-700 dark:text-blue-300">
							{loadingBootstrap
								? 'Checking admin bootstrap status...'
								: needsBootstrap
									? 'No admin exists - Bootstrap page should show'
									: 'Admin exists - Sign-in page should show'}
						</p>
					</div>

					{/* Admin Count */}
					<div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
						<div className="flex items-center justify-between mb-2">
							<span className="font-medium text-purple-900 dark:text-purple-200">
								Admin Count:
							</span>
							<span className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-sm font-semibold">
								{loadingAdmins
									? 'Loading...'
									: admins === undefined
										? 'Error'
										: admins.length}
							</span>
						</div>
						{admins && admins.length > 0 && (
							<button
								onClick={() => setShowDetails(!showDetails)}
								className="text-sm text-purple-600 hover:text-purple-700 underline">
								{showDetails ? 'Hide' : 'Show'} admin details
							</button>
						)}
					</div>

					{/* Admin Details */}
					{showDetails && admins && admins.length > 0 && (
						<div className="p-4 bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-lg">
							<h3 className="font-medium text-gray-900 dark:text-white mb-3">
								Admin Roles in Database:
							</h3>
							<div className="space-y-2">
								{admins.map((admin, index) => (
									<div
										key={index}
										className="text-sm bg-white dark:bg-neutral-900 p-3 rounded border border-gray-200 dark:border-neutral-700">
										<div className="font-mono text-xs text-gray-600 dark:text-gray-400">
											User ID: {admin.userId}
										</div>
										<div className="text-gray-800 dark:text-gray-200">
											Role: <span className="font-semibold">{admin.role}</span>
										</div>
										{admin.locations && admin.locations.length > 0 && (
											<div className="text-gray-600 dark:text-gray-400">
												Locations: {admin.locations.join(', ')}
											</div>
										)}
									</div>
								))}
							</div>
						</div>
					)}

					{/* Action Buttons */}
					<div className="pt-4 space-y-3">
						<button
							onClick={handleForceRefresh}
							className="w-full bg-blue-500 hover:bg-blue-600 text-white font-medium py-3 px-4 rounded-lg transition-colors">
							🔄 Force Page Refresh
						</button>

						<button
							onClick={() => {
								localStorage.clear();
								sessionStorage.clear();
								toast.success('Cache cleared! Refreshing...');
								setTimeout(() => window.location.reload(), 500);
							}}
							className="w-full bg-orange-500 hover:bg-orange-600 text-white font-medium py-3 px-4 rounded-lg transition-colors">
							🧹 Clear Cache & Refresh
						</button>
					</div>

					{/* Expected Behavior */}
					<div className="p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
						<h3 className="font-medium text-amber-900 dark:text-amber-200 mb-2">
							💡 Expected Behavior:
						</h3>
						<ul className="text-sm text-amber-800 dark:text-amber-300 space-y-1 list-disc list-inside">
							<li>If needsBootstrap = true &rarr; Show Bootstrap page</li>
							<li>If needsBootstrap = false &rarr; Show Sign-in page</li>
							<li>Admin count should match roles in database</li>
						</ul>
					</div>

					{/* Status Summary */}
					{needsBootstrap === false && admins && admins.length > 0 && (
						<div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
							<div className="flex items-start gap-3">
								<svg
									className="w-5 h-5 text-green-600 dark:text-green-400 shrink-0 mt-0.5"
									fill="none"
									stroke="currentColor"
									viewBox="0 0 24 24">
									<path
										strokeLinecap="round"
										strokeLinejoin="round"
										strokeWidth={2}
										d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
								<div>
									<p className="font-medium text-green-900 dark:text-green-200 mb-1">
										✅ Admin Account Ready!
									</p>
									<p className="text-sm text-green-700 dark:text-green-300">
										Your admin account exists. You should now see the sign-in
										page instead of bootstrap. If you&quot;re still seeing the
										bootstrap page, click &quot;Force Page Refresh&quot; above.
									</p>
								</div>
							</div>
						</div>
					)}
				</div>

				<div className="pt-6 text-center text-xs text-gray-500">
					Use this page to diagnose authentication state issues
				</div>
			</div>
		</div>
	);
}
