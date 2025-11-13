'use client';

import {useUser} from '@clerk/nextjs';
import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Toaster, toast} from 'sonner';
import {SignInForm} from '@/components/auth/SignInForm';
import KioskSession from '@/components/kiosk/KioskSession';
import GuardianChecklistPublic from '@/components/guardians/GuardianChecklistPublic';
import AccessControl from '@/components/shared/AccessControl';
import AdminPortal from '@/components/admin/AdminPortal';
import CarePortal from '@/components/care/CarePortal';
import PendingPage from '@/components/shared/PendingPage';

export default function HomePage() {
	const {isLoaded, isSignedIn, user} = useUser();
	const router = useRouter();
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
				const {getDeviceId, initializeDeviceId} = await import('@/lib/device');
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
	const [syncAttempted, setSyncAttempted] = useState(false);

	// Fetch session info and device check
	useEffect(() => {
		async function fetchData() {
			try {
				// Fetch session info
				const sessionRes = await fetch('/api/access/session');
				const session = await sessionRes.json();
				setSessionInfo(session);

				// Fetch device check
				const deviceRes = await fetch(
					`/api/devices/check?deviceId=${deviceId}`
				);
				const device = await deviceRes.json();
				setDeviceCheck(device);

				// Auto-sync user if needed
				if (session.needsSync && !syncAttempted) {
					setSyncAttempted(true);
					const syncRes = await fetch('/api/auth/sync', {method: 'POST'});
					const syncResult = await syncRes.json();

					if (syncResult.success) {
						if (syncResult.isFirstAdmin) {
							toast.success('Welcome! You are the first admin.');
						} else {
							toast.success('Account restored successfully!');
						}
						// Refresh session info
						const newSessionRes = await fetch('/api/access/session');
						const newSession = await newSessionRes.json();
						setSessionInfo(newSession);
					}
				}

				setLoading(false);
			} catch (error) {
				console.error('Error fetching data:', error);
				setLoading(false);
			}
		}

		if (user?.id) {
			fetchData();
		}
	}, [user?.id, deviceId, syncAttempted]);

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
			console.log('🔍 Session Info:', sessionInfo);
			console.log('📱 Device Check:', deviceCheck);
		}
	}, [user, deviceId, sessionInfo, deviceCheck]);

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="text-4xl mb-4">⏳</div>
					<p className="text-gray-600">Loading your profile...</p>
				</div>
			</div>
		);
	}

	// Device authorization check
	if (deviceCheck && (!deviceCheck.isRegistered || !deviceCheck.isActive)) {
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
	if (!sessionInfo?.role) {
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
