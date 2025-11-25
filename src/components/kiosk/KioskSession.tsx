'use client';

import React, {useState, useEffect} from 'react';
import {useUser} from '@clerk/nextjs';
import SelfieCapture from '../shared/SelfieCapture';
import AutoLock from '../shared/AutoLock';
import QuickSignOut from '../shared/QuickSignOut';
import LocationBanner from '../admin/LocationBanner';
import ResidentCase from '../care/ResidentCase';
import KioskPairingScreen from './KioskPairingScreen';

export default function KioskSession() {
	const [locked, setLocked] = useState(false);
	const [selfie, setSelfie] = useState<string | null>(null);
	const [selfieError, setSelfieError] = useState<string | null>(null);
	const [deviceId, setDeviceId] = useState<string | null>(() => {
		if (typeof window !== 'undefined') {
			const storedDeviceId = localStorage.getItem('kioskDeviceId');
			if (storedDeviceId) {
				console.log('Found stored device ID:', storedDeviceId);
				return storedDeviceId;
			}
		}
		return null;
	});
	const [isPaired, setIsPaired] = useState(() => {
		if (typeof window !== 'undefined') {
			return !!localStorage.getItem('kioskDeviceId');
		}
		return false;
	});
	const [kiosk, setKiosk] = useState<any>(null);
	const [config, setConfig] = useState<any>(null);
	const [userRole, setUserRole] = useState<any>(null);
	const [currentUser, setCurrentUser] = useState<any>(null);
	const [residents, setResidents] = useState<any[]>([]);
	const [selectedResidentId, setSelectedResidentId] = useState<string | null>(
		null
	);
	const [loading, setLoading] = useState(true);

	const {user: clerkUser} = useUser();

	// Fetch kiosk data, config, user role, current user, and residents
	useEffect(() => {
		async function fetchData() {
			if (!deviceId) return;

			setLoading(true);
			try {
				// Fetch all data in parallel
				const [kioskRes, configRes, roleRes, userRes, residentsRes] =
					await Promise.all([
						fetch(`/api/kiosk/by-device?deviceId=${deviceId}`),
						fetch('/api/settings/app'),
						fetch('/api/users/role'),
						fetch('/api/users/current'),
						fetch('/api/residents'),
					]);

				const [kioskData, configData, roleData, userData, residentsData] =
					await Promise.all([
						kioskRes.json(),
						configRes.json(),
						roleRes.json(),
						userRes.json(),
						residentsRes.json(),
					]);

				setKiosk(kioskData);
				setConfig(configData);
				setUserRole(roleData);
				setCurrentUser(userData);
				setResidents(residentsData);
			} catch (error) {
				console.error('Error fetching kiosk data:', error);
			} finally {
				setLoading(false);
			}
		}

		fetchData();
	}, [deviceId]);

	// Update last seen periodically (heartbeat)
	useEffect(() => {
		if (!deviceId || !kiosk?.isActive) return;

		// Initial heartbeat
		fetch('/api/kiosk/update-last-seen', {
			method: 'POST',
			headers: {'Content-Type': 'application/json'},
			body: JSON.stringify({deviceId}),
		});

		// Set up interval for periodic heartbeats
		const interval = setInterval(async () => {
			await fetch('/api/kiosk/update-last-seen', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({deviceId}),
			});
		}, 30000); // Every 30 seconds

		return () => clearInterval(interval);
	}, [deviceId, kiosk?.isActive]);

	// Show pairing screen if not paired
	if (!isPaired || !deviceId) {
		return (
			<KioskPairingScreen
				onPairingComplete={(deviceData) => {
					setDeviceId(deviceData.deviceId);
					setIsPaired(true);
				}}
			/>
		);
	}

	// Loading state
	if (loading) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading kiosk session...</p>
				</div>
			</div>
		);
	}

	// Check if kiosk is still registered
	if (kiosk === null) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-red-600 mb-4">
						Kiosk Not Found
					</h1>
					<p className="text-gray-600 mb-4">
						This kiosk is not registered or has been removed.
					</p>
					<button
						onClick={() => {
							localStorage.removeItem('kioskDeviceId');
							localStorage.removeItem('kioskLocation');
							localStorage.removeItem('kioskLabel');
							setIsPaired(false);
							setDeviceId(null);
						}}
						className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
						Re-pair Kiosk
					</button>
				</div>
			</div>
		);
	}

	// Check if kiosk is active
	if (kiosk && !kiosk.isActive) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-yellow-600 mb-4">
						Kiosk Disabled
					</h1>
					<p className="text-gray-600">
						This kiosk has been disabled by an administrator.
					</p>
					<p className="text-sm text-gray-500 mt-2">
						Contact support if you believe this is an error.
					</p>
				</div>
			</div>
		);
	}

	// Check user role authorization
	if (
		userRole &&
		userRole.role &&
		!['staff', 'supervisor', 'admin'].includes(userRole.role)
	) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center">
					<h1 className="text-2xl font-bold text-red-600 mb-4">
						Not Authorized
					</h1>
					<p className="text-gray-600">
						You do not have permission to use this kiosk.
					</p>
					<p className="text-sm text-gray-500 mt-2">
						Only staff, supervisors, and admins can access kiosk mode.
					</p>
				</div>
			</div>
		);
	}

	// Selfie enforcement logic
	if (clerkUser && currentUser && config?.selfieEnforced && !selfie) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
				<h2 className="text-2xl font-bold">Selfie Required</h2>
				<p className="text-gray-600 text-center max-w-md">
					Please take a selfie to verify your identity before using the kiosk.
				</p>
				<SelfieCapture
					onCapture={async (storageId: string) => {
						setSelfie(storageId);
						// Optionally log selfie capture event
						console.log('✅ Selfie captured:', storageId);
					}}
					onCancel={() => setSelfieError('Selfie capture cancelled')}
				/>
				{selfieError && <div className="text-red-600">{selfieError}</div>}
			</div>
		);
	}

	// Auto-lock on inactivity
	if (locked) {
		return (
			<div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gray-50">
				<h2 className="text-2xl font-bold">Session Locked</h2>
				<p className="text-gray-600">Click unlock to continue</p>
				<button
					className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
					onClick={() => setLocked(false)}>
					Unlock
				</button>
				<QuickSignOut />
			</div>
		);
	}

	// Main kiosk interface
	return (
		<div className="min-h-screen bg-gray-50">
			<LocationBanner location={kiosk?.location ?? 'Unknown'} />
			<AutoLock onLock={() => setLocked(true)} />

			<div className="container mx-auto p-6">
				{/* Resident selection UI */}
				<div className="bg-white rounded-lg shadow-md p-6 mb-6">
					<div className="flex items-center justify-between mb-4">
						<h3 className="text-xl font-semibold">Select Resident</h3>
						<QuickSignOut />
					</div>

					{!residents || residents.length === 0 ? (
						<div className="text-center py-8 text-gray-500">
							No residents available
						</div>
					) : (
						<div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
							{residents.map((r: any) => (
								<button
									key={r.id}
									className={`p-4 rounded-lg border-2 transition-colors ${
										selectedResidentId === r.id
											? 'bg-blue-600 text-white border-blue-600'
											: 'bg-white text-gray-900 border-gray-300 hover:border-blue-400'
									}`}
									onClick={() => setSelectedResidentId(r.id)}>
									<div className="font-medium">{r.name}</div>
									<div className="text-sm opacity-75">{r.location}</div>
								</button>
							))}
						</div>
					)}
				</div>

				{/* Resident case folder */}
				{selectedResidentId && (
					<div className="bg-white rounded-lg shadow-md p-6">
						<ResidentCase residentId={selectedResidentId} />
					</div>
				)}
			</div>
		</div>
	);
}
