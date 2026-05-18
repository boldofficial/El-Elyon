'use client';

import {useUser} from '@clerk/nextjs';
import {useEffect, useState, useRef} from 'react';
import {Toaster, toast} from 'sonner';
import {initializeDeviceId, getDeviceId} from '@/lib/device';
import AccessControl from '@/components/shared/AccessControl';
import AdminPortal from '@/components/admin/AdminPortal';
import {SignInForm} from '@/components/auth/SignInForm';

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

export default function AdminPage() {
	const {isLoaded, isSignedIn, user} = useUser();
	const [deviceInitialized, setDeviceInitialized] = useState(false);
	const [deviceId, setDeviceId] = useState<string>('');
	const initRef = useRef(false);

	const [loading, setLoading] = useState(true);
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [deviceCheck, setDeviceCheck] = useState<any>(null);
	const [userCheck, setUserCheck] = useState<any>(null);
	const [syncAttempted, setSyncAttempted] = useState(false);
	const [syncInProgress, setSyncInProgress] = useState(false);
	const fetchRef = useRef(false);

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

	// Fetch user and session data
	useEffect(() => {
		if (!user?.id || !deviceId) return;
		if (fetchRef.current) return;
		fetchRef.current = true;

		async function fetchData() {
			try {
				const userCheckData = await checkUserExists();
				setUserCheck(userCheckData);

				if (userCheckData?.needsSync && !syncAttempted && !syncInProgress) {
					setSyncAttempted(true);
					setSyncInProgress(true);

					try {
						const syncResult = await syncUser(user);
						if (syncResult.isFirstAdmin) {
							toast.success('Welcome! You are the first admin.');
						} else {
							toast.success('Account restored successfully!');
						}
						const updatedUserCheck = await checkUserExists();
						setUserCheck(updatedUserCheck);
					} catch (error) {
						console.error('❌ Auto-sync failed:', error);
						toast.error('Failed to sync user. Please refresh the page.');
					} finally {
						setSyncInProgress(false);
					}
				}

				const session = await getSessionInfo();
				setSessionInfo(session);

				const device = await checkDevice(deviceId);
				setDeviceCheck(device);

				setLoading(false);
			} catch (error) {
				console.error('Error fetching data:', error);
				setLoading(false);
			}
		}

		fetchData();
	}, [user?.id, deviceId, syncAttempted, syncInProgress]);

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

	// Loading state
	if (loading || syncInProgress || (userCheck?.needsSync && !syncAttempted) || !sessionInfo || !deviceCheck) {
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

	// Device authorization check
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

	return (
		<>
			<Toaster />
			<AccessControl route="/admin">
				<AdminPortal />
			</AccessControl>
		</>
	);
}
