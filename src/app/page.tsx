'use client';

import {useUser} from '@clerk/nextjs';
import {useEffect, useState, useRef} from 'react';
import {Toaster, toast} from 'sonner';
import {initializeDeviceId, getDeviceId} from '@/lib/device';

import GuardianChecklistPublic from '@/components/guardian/GuardianChecklistPublic';
import PendingPage from '@/components/shared/PendingPage';
import {SignInForm} from '@/components/auth/SignInForm';

// API helper functions
async function checkUserExists() {
	const res = await fetch('/api/auth/ensure-user');
	if (!res.ok) return null;
	return await res.json();
}

async function syncUser(user: any) {
	const res = await fetch('/api/auth/sync', {
		method: 'POST',
		headers: {'Content-Type': 'application/json'},
		body: JSON.stringify({
			email: user?.primaryEmailAddress?.emailAddress,
			name: user?.fullName || user?.username || 'User',
		}),
	});
	if (!res.ok) {
		const errorText = await res.text();
		throw new Error(`Sync failed: ${errorText}`);
	}
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
	const initRef = useRef(false);

	// Check for checklist token in URL (legacy support)
	const [checklistToken, setChecklistToken] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);
			setChecklistToken(params.get('checklist'));
		}
	}, []);

	// Initialize device ID - ONLY ONCE
	useEffect(() => {
		if (initRef.current) return;
		initRef.current = true;

		async function initDevice() {
			try {
				const id = await initializeDeviceId();
				setDeviceId(id);
				setDeviceInitialized(true);
			} catch (error) {
				console.error('❌ Failed to initialize device:', error);
				const existingId = getDeviceId();
				if (existingId) setDeviceId(existingId);
				setDeviceInitialized(true);
			}
		}

		initDevice();
	}, []);

	// Show Guardian Checklist if token present (legacy URL support)
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

	// User is authenticated, redirect to appropriate portal
	return (
		<>
			<Toaster />
			<AuthenticatedRedirect deviceId={deviceId} />
		</>
	);
}

function AuthenticatedRedirect({deviceId}: {deviceId: string}) {
	const {user} = useUser();
	const [loading, setLoading] = useState(true);
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [deviceCheck, setDeviceCheck] = useState<any>(null);
	const [userCheck, setUserCheck] = useState<any>(null);
	const [syncAttempted, setSyncAttempted] = useState(false);
	const [syncInProgress, setSyncInProgress] = useState(false);
	const fetchRef = useRef(false);

	// Check if user exists in database and get session info
	useEffect(() => {
		if (!user?.id || !deviceId) return;
		if (fetchRef.current) return;
		fetchRef.current = true;

		async function fetchData() {
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
						const syncResult = await syncUser(user);
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

	// Loading state
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

	// If user has no role, show pending page
	if (!sessionInfo?.role && !sessionInfo?.authenticated) {
		return (
			<PendingPage message="Your account is pending approval. An administrator will assign you a role soon." />
		);
	}

	// Redirect based on role
	if (sessionInfo.role === 'admin') {
		if (typeof window !== 'undefined') {
			window.location.href = '/admin';
		}
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="text-4xl mb-4">🔄</div>
					<p className="text-gray-600">Redirecting to Admin Portal...</p>
				</div>
			</div>
		);
	}

	if (sessionInfo.role === 'supervisor' || sessionInfo.role === 'staff') {
		if (typeof window !== 'undefined') {
			window.location.href = '/care';
		}
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="text-4xl mb-4">🔄</div>
					<p className="text-gray-600">Redirecting to Care Portal...</p>
				</div>
			</div>
		);
	}

	// Fallback
	return <PendingPage />;
}
