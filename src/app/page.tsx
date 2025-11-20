'use client';

import {useUser} from '@clerk/nextjs';
import {useEffect, useState} from 'react';
import {Toaster, toast} from 'sonner';

import KioskSession from '@/components/kiosk/KioskSession';
import GuardianChecklistPublic from '@/components/guardian/GuardianChecklistPublic';
import AccessControl from '@/components/shared/AccessControl';
import AdminPortal from '@/components/admin/AdminPortal';
import CarePortal from '@/components/care/CarePortal';
import PendingPage from '@/components/shared/PendingPage';
import {SignInForm} from '@/components/auth/SignInForm';
import {initializeDeviceId} from '@/lib/device';

// API helper functions
async function checkUserExists() {
	const res = await fetch('/api/auth/ensure-user');
	if (!res.ok) return null;
	return await res.json();
}

async function syncUser() {
	const res = await fetch('/api/auth/sync', {method: 'POST'});
	if (!res.ok) throw new Error('Sync failed');
	return await res.json();
}

async function checkDevice(deviceId: string) {
	const res = await fetch('/api/devices/check', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({deviceId}),
	});
	if (!res.ok) return null;
	return await res.json();
}

async function getSessionInfo() {
	const res = await fetch('/api/access/session');
	if (!res.ok) return null;
	return await res.json();
}

async function recordDeviceUsage(deviceId: string) {
	try {
		const res = await fetch('/api/devices/record-usage', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({deviceId}),
		});
		if (!res.ok) {
			console.error('Failed to record device usage');
		}
	} catch (error) {
		console.error('Error recording device usage:', error);
	}
}

export default function HomePage() {
	const {isLoaded, isSignedIn, user} = useUser();
	const [deviceInitialized, setDeviceInitialized] = useState(false);
	const [deviceId, setDeviceId] = useState<string>('');

	// Check for checklist token in URL
	const [checklistToken, setChecklistToken] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);
			setChecklistToken(params.get('checklist'));
		}
	}, []);

	// Initialize device ID
	useEffect(() => {
		async function initDevice() {
			try {
				const id = await initializeDeviceId();
				setDeviceId(id);
				console.log('📱 Device initialized:', id);
				setDeviceInitialized(true);
			} catch (error) {
				console.error('❌ Failed to initialize device:', error);
				setDeviceInitialized(true); // Continue anyway
			}
		}
		initDevice();
	}, []);

	// Show Guardian Checklist if token present
	if (checklistToken) {
		return (
			<>
				<Toaster />
				<GuardianChecklistPublic token={checklistToken} />
			</>
		);
	}

	// Wait for Clerk and device to load
	if (!isLoaded || !deviceInitialized) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="text-4xl mb-4">🔐</div>
					<p className="text-gray-600">Initializing...</p>
				</div>
			</div>
		);
	}

	// Show sign-in form if not authenticated
	if (!isSignedIn) {
		return (
			<>
				<Toaster />
				<SignInForm />
			</>
		);
	}

	// User is authenticated, render the authenticated app
	return (
		<>
			<Toaster />
			<AuthenticatedApp deviceId={deviceId} />
		</>
	);
}

function AuthenticatedApp({deviceId}: {deviceId: string}) {
	const {user} = useUser();
	const [currentRoute, setCurrentRoute] = useState('/');
	const [loading, setLoading] = useState(true);
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [deviceCheck, setDeviceCheck] = useState<any>(null);
	const [userCheck, setUserCheck] = useState<any>(null);
	const [syncAttempted, setSyncAttempted] = useState(false);
	const [syncInProgress, setSyncInProgress] = useState(false);

	// Check if user exists in database and get session info
	useEffect(() => {
		async function fetchData() {
			if (!user?.id || !deviceId) return;

			try {
				// Check if user exists in database (self-healing check)
				const userCheckData = await checkUserExists();
				setUserCheck(userCheckData);

				// If user needs sync, trigger it
				if (userCheckData?.needsSync && !syncAttempted && !syncInProgress) {
					console.log('🔄 Auto-syncing user to database...');
					setSyncAttempted(true);
					setSyncInProgress(true);

					try {
						const syncResult = await syncUser();
						console.log('✅ User synced:', syncResult);

						if (syncResult.isFirstAdmin) {
							toast.success('Welcome! You are the first admin.');
						} else {
							toast.success('Account restored successfully!');
						}

						// Refresh user check
						const updatedUserCheck = await checkUserExists();
						setUserCheck(updatedUserCheck);
					} catch (error) {
						console.error('❌ Auto-sync failed:', error);
						toast.error('Failed to sync user. Please refresh the page.');
					} finally {
						setSyncInProgress(false);
					}
				}

				// Get session info (includes role)
				const session = await getSessionInfo();
				setSessionInfo(session);

				// Check device authorization
				const device = await checkDevice(deviceId);
				setDeviceCheck(device);

				// Record device usage if authorized
				if (device?.isRegistered && device?.isActive) {
					await recordDeviceUsage(deviceId);
				}

				setLoading(false);
			} catch (error) {
				console.error('Error fetching data:', error);
				setLoading(false);
			}
		}

		fetchData();
	}, [user?.id, deviceId, syncAttempted, syncInProgress]);

	// Update route when URL changes
	useEffect(() => {
		setCurrentRoute(window.location.pathname);

		const handlePopState = () => {
			setCurrentRoute(window.location.pathname);
		};

		window.addEventListener('popstate', handlePopState);
		return () => window.removeEventListener('popstate', handlePopState);
	}, []);

	// Debug logging
	useEffect(() => {
		if (user?.id) {
			console.log('🔑 User ID:', user.id);
			console.log('📧 Email:', user.primaryEmailAddress?.emailAddress);
			console.log('💻 Device ID:', deviceId);
			console.log('🔍 User Check:', userCheck);
			console.log('🔍 Session Info:', sessionInfo);
			console.log('📱 Device Check:', deviceCheck);
		}
	}, [user, deviceId, userCheck, sessionInfo, deviceCheck]);

	// Loading state - show while syncing or fetching data
	if (
		loading ||
		syncInProgress ||
		(userCheck?.needsSync && !syncAttempted) ||
		!sessionInfo ||
		!deviceCheck
	) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="text-4xl mb-4">⏳</div>
					<p className="text-gray-600">
						{syncInProgress
							? 'Setting up your account...'
							: userCheck?.needsSync
								? 'Restoring your profile...'
								: 'Loading your profile...'}
					</p>
				</div>
			</div>
		);
	}

	// Device authorization check - Block if device not registered or inactive
	// Admins bypass this check (handled in API)
	if (!deviceCheck.isRegistered || !deviceCheck.isActive) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-red-50">
				<div className="max-w-md w-full bg-white p-8 rounded-lg shadow-lg text-center">
					<div className="text-6xl mb-4">🚫</div>
					<h2 className="text-2xl font-bold text-gray-900 mb-4">
						Unauthorized Device
					</h2>
					<p className="text-gray-600 mb-2">{deviceCheck.message}</p>
					<div className="bg-gray-50 p-4 rounded-lg mt-4 mb-4">
						<p className="text-xs text-gray-500 mb-2">Device ID:</p>
						<code className="text-xs bg-white px-3 py-2 rounded border border-gray-200 block break-all">
							{deviceId}
						</code>
					</div>
					<p className="text-sm text-gray-600">
						Please contact your administrator to register this device.
					</p>
				</div>
			</div>
		);
	}

	// Handle kiosk mode
	if (currentRoute === '/kiosk' || sessionInfo?.role?.isKiosk) {
		return <KioskSession />;
	}

	// If user has no role, show pending page
	if (!sessionInfo?.role && !sessionInfo?.authenticated) {
		return (
			<PendingPage message="Your account is pending approval. An administrator will assign you a role soon." />
		);
	}

	// Admin portal
	if (currentRoute.startsWith('/admin')) {
		return (
			<AccessControl route={currentRoute}>
				<AdminPortal />
			</AccessControl>
		);
	}

	// Care portal
	if (currentRoute.startsWith('/care')) {
		return (
			<AccessControl route={currentRoute}>
				<CarePortal />
			</AccessControl>
		);
	}

	// Default routing based on role
	if (sessionInfo.role === 'admin') {
		return (
			<AccessControl route="/admin">
				<AdminPortal />
			</AccessControl>
		);
	}

	if (sessionInfo.role === 'supervisor' || sessionInfo.role === 'staff') {
		return (
			<AccessControl route="/care">
				<CarePortal />
			</AccessControl>
		);
	}

	// Fallback
	return <PendingPage />;
}
