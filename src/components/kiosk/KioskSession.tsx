'use client';

import React, {useState, useEffect} from 'react';
import {useUser} from '@clerk/nextjs';
import SelfieCapture from './SelfieCapture';
import AutoLock from './AutoLock';
import QuickSignOut from './QuickSignOut';
import LocationBanner from './LocationBanner';
import ResidentCase from './ResidentCase';
import KioskPairingScreen from './KioskPairingScreen';

export default function KioskSession() {
	const [locked, setLocked] = useState(false);
	const [selfie, setSelfie] = useState<string | null>(null);
	const [selfieError, setSelfieError] = useState<string | null>(null);
	const [deviceId, setDeviceId] = useState<string | null>(null);
	const [isPaired, setIsPaired] = useState(false);
	const [kiosk, setKiosk] = useState<any>(null);
	const [config, setConfig] = useState<any>(null);
	const [userRole, setUserRole] = useState<any>(null);
	const [currentUser, setCurrentUser] = useState<any>(null);
	const [residents, setResidents] = useState<any[]>([]);
	const [selectedResidentId, setSelectedResidentId] = useState<string | null>(
		null
	);

	const {user: clerkUser} = useUser();

	// Check for existing pairing on mount
	useEffect(() => {
		const storedDeviceId = localStorage.getItem('kioskDeviceId');
		if (storedDeviceId) {
			console.log('Found stored device ID:', storedDeviceId);
			setDeviceId(storedDeviceId);
			setIsPaired(true);
		}
	}, []);

	// Fetch kiosk data, config, user role, and residents
	useEffect(() => {
		async function fetchData() {
			if (!deviceId) return;

			try {
				// Fetch kiosk data
				const kioskRes = await fetch(
					`/api/kiosk/by-device?deviceId=${deviceId}`
				);
				const kioskData = await kioskRes.json();
				setKiosk(kioskData);

				// Fetch config
				const configRes = await fetch('/api/settings/app');
				const configData = await configRes.json();
				setConfig(configData);

				// Fetch user role
				const roleRes = await fetch('/api/users/role');
				const roleData = await roleRes.json();
				setUserRole(roleData);

				// Fetch current user
				const userRes = await fetch('/api/users/current');
				const userData = await userRes.json();
				setCurrentUser(userData);

				// Fetch residents
				const residentsRes = await fetch('/api/residents');
				const residentsData = await residentsRes.json();
				setResidents(residentsData);
			} catch (error) {
				console.error('Error fetching kiosk data:', error);
			}
		}

		fetchData();
	}, [deviceId]);

	// Update last seen periodically
	useEffect(() => {
		if (deviceId && kiosk?.isActive) {
			const interval = setInterval(async () => {
				await fetch('/api/kiosk/update-last-seen', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({deviceId}),
				});
			}, 30000); // Every 30 seconds

			return () => clearInterval(interval);
		}
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

	// Check if kiosk is still active
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

	// Only allow staff, supervisor, or admin
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
	if (clerkUser && currentUser && config && config.selfieEnforced && !selfie) {
		return (
			<div className="flex flex-col items-center gap-4">
				<h2 className="text-2xl font-bold">Selfie Required</h2>
				<SelfieCapture
					onCapture={async (storageId: string) => {
						setSelfie(storageId);
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
			<div className="flex flex-col items-center gap-4">
				<h2 className="text-2xl font-bold">Session Locked</h2>
				<button className="button" onClick={() => setLocked(false)}>
					Unlock
				</button>
				<QuickSignOut />
			</div>
		);
	}

	return (
		<div>
			<LocationBanner location={kiosk?.location ?? 'Unknown'} />
			<AutoLock onLock={() => setLocked(true)} />
			<QuickSignOut />

			{/* Resident selection UI */}
			<div className="my-4">
				<h3 className="font-semibold mb-2">Residents</h3>
				{!residents ? (
					<div>Loading residents...</div>
				) : (
					<ul className="flex flex-wrap gap-2">
						{residents.map((r: any) => (
							<li key={r.id}>
								<button
									className={`px-2 py-1 rounded ${selectedResidentId === r.id ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
									onClick={() => setSelectedResidentId(r.id)}>
									{r.name}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>

			{/* Resident case folder */}
			{selectedResidentId && <ResidentCase residentId={selectedResidentId} />}
		</div>
	);
}
