'use client';

import React, {useState, useEffect} from 'react';
import SelfieCapture from '../shared/SelfieCapture';
import {toast} from 'sonner';

interface CareShiftWorkspaceProps {
	onShiftChange?: () => void;
}

export default function CareShiftWorkspace({ onShiftChange }: CareShiftWorkspaceProps) {
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [currentShift, setCurrentShift] = useState<any>(null);
	const [isSelfieEnforced, setIsSelfieEnforced] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [showSelfieCapture, setShowSelfieCapture] = useState(false);
	const [selfieAction, setSelfieAction] = useState<
		'clockIn' | 'clockOut' | null
	>(null);
	const [currentTime, setCurrentTime] = useState(Date.now());

	// Fetch session info and current shift
	useEffect(() => {
		async function fetchData() {
			try {
				const sessionRes = await fetch('/api/access/session');
				const session = await sessionRes.json();
				setSessionInfo(session);

				const shiftRes = await fetch('/api/shifts/current');
				const shift = await shiftRes.json();
				setCurrentShift(shift);

				const configRes = await fetch('/api/settings/app');
				const config = await configRes.json();
				setIsSelfieEnforced(config?.selfieEnforced || false);
			} catch (error) {
				console.error('Error fetching shift data:', error);
			}
		}

		fetchData();
	}, []);

	// Update current time every second for live duration display
	useEffect(() => {
		const interval = setInterval(() => {
			setCurrentTime(Date.now());
		}, 1000);
		return () => clearInterval(interval);
	}, []);

	const handleClockIn = async () => {
		if (!sessionInfo?.locations?.length) {
			toast.error('No assigned locations. Contact your supervisor.');
			return;
		}

		// Check if selfie is required
		if (isSelfieEnforced) {
			setSelfieAction('clockIn');
			setShowSelfieCapture(true);
			return;
		}

		// Proceed without selfie
		setIsProcessing(true);
		try {
			const res = await fetch('/api/shifts/clock-in', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					location: sessionInfo.locations[0],
				}),
			});

			if (!res.ok) throw new Error('Failed to clock in');

			toast.success('Clocked in successfully');

			// Refresh current shift
			const shiftRes = await fetch('/api/shifts/current');
			const shift = await shiftRes.json();
			setCurrentShift(shift);

			// Notify parent to update sidebar
			onShiftChange?.();
		} catch (error: any) {
			toast.error(error.message || 'Failed to clock in');
		} finally {
			setIsProcessing(false);
		}
	};

	const handleClockOut = async () => {
		if (!currentShift) return;

		// Check if selfie is required for clock out
		if (isSelfieEnforced) {
			setSelfieAction('clockOut');
			setShowSelfieCapture(true);
			return;
		}

		setIsProcessing(true);
		try {
			const res = await fetch('/api/shifts/clock-out', {
				method: 'POST',
			});

			if (!res.ok) throw new Error('Failed to clock out');

			toast.success('Clocked out successfully');
			setCurrentShift(null);

			// Notify parent to update sidebar
			onShiftChange?.();
		} catch (error: any) {
			toast.error(error.message || 'Failed to clock out');
		} finally {
			setIsProcessing(false);
		}
	};

	const handleSelfieCapture = async (storageId: string) => {
		setShowSelfieCapture(false);
		setIsProcessing(true);
		try {
			let res;
			if (selfieAction === 'clockIn') {
				res = await fetch('/api/shifts/clock-in', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({
						location: sessionInfo!.locations[0],
						selfieStorageId: storageId,
					}),
				});
				if (!res.ok) throw new Error('Failed to clock in with selfie');
				toast.success('Clocked in with selfie');
			} else if (selfieAction === 'clockOut') {
				res = await fetch('/api/shifts/clock-out', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({
						selfieStorageId: storageId,
					}),
				});
				if (!res.ok) throw new Error('Failed to clock out with selfie');
				toast.success('Clocked out with selfie');
				setCurrentShift(null); // Reset current shift after clock out
			} else {
				throw new Error('Invalid selfie action');
			}

			// Refresh current shift only if clocking in
			if (selfieAction === 'clockIn') {
				const shiftRes = await fetch('/api/shifts/current');
				const shift = await shiftRes.json();
				setCurrentShift(shift);
			}

			// Notify parent to update sidebar
			onShiftChange?.();
		} catch (error: any) {
			toast.error(error.message || 'Failed to process selfie action');
		} finally {
			setIsProcessing(false);
			setSelfieAction(null);
		}
	};

	const formatDuration = (startTime: string | Date) => {
		const start = new Date(startTime).getTime();
		const duration = currentTime - start;
		const hours = Math.floor(duration / (1000 * 60 * 60));
		const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60));
		const seconds = Math.floor((duration % (1000 * 60)) / 1000);
		return `${hours}h ${minutes}m ${seconds}s`;
	};

	if (showSelfieCapture) {
		return (
			<SelfieCapture
				onCapture={handleSelfieCapture}
				onCancel={() => {
					setShowSelfieCapture(false);
					setSelfieAction(null);
				}}
			/>
		);
	}

	return (
		<div className="max-w-2xl mx-auto space-y-6">
			<div className="text-center">
				<h2 className="text-2xl font-bold text-gray-900 mb-2">
					Shift Management
				</h2>
				<p className="text-gray-600">Clock in and out of your shifts</p>
			</div>

			{/* Current Status */}
			<div className="bg-white rounded-lg shadow-sm border p-6">
				<div className="text-center">
					{currentShift ? (
						<div className="space-y-4">
							<div className="inline-flex items-center px-4 py-2 rounded-full bg-green-100 text-green-800">
								<div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
								Currently Clocked In
							</div>

							<div className="space-y-2">
								<p className="text-sm text-gray-600">
									Started: {new Date(currentShift.clockInTime).toLocaleString()}
								</p>
								<p className="text-sm text-gray-600">
									Location: {currentShift.location}
								</p>
								<p className="text-lg font-semibold text-gray-900">
									Duration: {formatDuration(currentShift.clockInTime)}
								</p>
							</div>

							<button
								onClick={handleClockOut}
								disabled={isProcessing}
								className="w-full max-w-xs mx-auto bg-red-600 text-white py-3 px-6 rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
								{isProcessing ? 'Clocking Out...' : 'Clock Out'}
							</button>
						</div>
					) : (
						<div className="space-y-4">
							<div className="inline-flex items-center px-4 py-2 rounded-full bg-gray-100 text-gray-600">
								<div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
								Not Clocked In
							</div>

							{sessionInfo?.locations?.length ? (
								<div className="space-y-2">
									<p className="text-sm text-gray-600">
										Assigned Location: {sessionInfo.locations.join(', ')}
									</p>
									<button
										onClick={handleClockIn}
										disabled={isProcessing}
										className="w-full max-w-xs mx-auto bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
										{isProcessing ? 'Clocking In...' : 'Clock In'}
									</button>
								</div>
							) : (
								<div className="text-center py-4">
									<p className="text-gray-600 mb-2">No assigned locations</p>
									<p className="text-sm text-gray-500">
										Contact your supervisor to get assigned to locations
									</p>
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Shift Guidelines */}
			<div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
				<h3 className="font-semibold text-blue-900 mb-3">Shift Guidelines</h3>
				<ul className="space-y-2 text-sm text-blue-800">
					<li className="flex items-start">
						<span className="mr-2">•</span>
						<span>Clock in at the start of your scheduled shift</span>
					</li>
					<li className="flex items-start">
						<span className="mr-2">•</span>
						<span>
							Clock out at the end of your shift or when leaving the facility
						</span>
					</li>
					<li className="flex items-start">
						<span className="mr-2">•</span>
						<span>Contact your supervisor for any time adjustments needed</span>
					</li>
					<li className="flex items-start">
						<span className="mr-2">•</span>
						<span>
							All clock in/out times are automatically recorded for payroll
						</span>
					</li>
				</ul>
			</div>
		</div>
	);
}
