'use client';

import React, {useState, useEffect} from 'react';
import SelfieCapture from '../shared/SelfieCapture';
import {toast} from 'sonner';
import {SHIFT_SLOTS, type ShiftSlot} from '@/lib/water-temperature';

interface CareShiftWorkspaceProps {
	onShiftChange?: () => void;
}

const SHIFT_SLOT_LABELS: Record<ShiftSlot, string> = {
	1: '1st Shift',
	2: '2nd Shift',
	3: '3rd Shift',
};

/**
 * Builds the clock-in request payload from the currently selected house and
 * shift slot, or returns null if either is missing/invalid. Used by both
 * the normal and selfie clock-in paths so they always submit the same
 * (location, shiftSlot) pair -- see R1/KTD1 in the daily water-temperature
 * checks plan: the slot must be explicitly selected, never inferred, and
 * must be preserved across the selfie-capture interstitial.
 */
export function buildClockInPayload(
	selectedLocation: string,
	selectedShiftSlot: ShiftSlot | ''
): {location: string; shiftSlot: ShiftSlot} | null {
	if (!selectedLocation || !selectedLocation.trim()) return null;
	if (selectedShiftSlot === '') return null;
	if (!SHIFT_SLOTS.includes(selectedShiftSlot)) return null;
	return {location: selectedLocation, shiftSlot: selectedShiftSlot};
}

/**
 * Gate used by both the Clock In button's `disabled` state and the
 * beginning of handleClockIn/handleSelfieCapture, so a double-submit
 * (e.g. a rapid double Enter/click before React re-renders the disabled
 * button) is rejected the same way the UI already visually prevents it.
 */
export function canSubmitClockIn(args: {
	selectedLocation: string;
	selectedShiftSlot: ShiftSlot | '';
	isProcessing: boolean;
}): boolean {
	if (args.isProcessing) return false;
	return buildClockInPayload(args.selectedLocation, args.selectedShiftSlot) !== null;
}

/** Gate for the one-time legacy-shift classification action. */
export function canSubmitClassification(args: {
	selectedShiftSlot: ShiftSlot | '';
	isProcessing: boolean;
}): boolean {
	if (args.isProcessing) return false;
	if (args.selectedShiftSlot === '') return false;
	return SHIFT_SLOTS.includes(args.selectedShiftSlot);
}

export default function CareShiftWorkspace({ onShiftChange }: CareShiftWorkspaceProps) {
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [currentShift, setCurrentShift] = useState<any>(null);
	const [isSelfieEnforced, setIsSelfieEnforced] = useState(false);
	const [isProcessing, setIsProcessing] = useState(false);
	const [showSelfieCapture, setShowSelfieCapture] = useState(false);
	const [selectedLocation, setSelectedLocation] = useState('');
	const [selectedShiftSlot, setSelectedShiftSlot] = useState<ShiftSlot | ''>('');
	const [classifyShiftSlot, setClassifyShiftSlot] = useState<ShiftSlot | ''>('');
	const [isClassifying, setIsClassifying] = useState(false);
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
				if (session?.locations?.length) {
					setSelectedLocation((current) => current || session.locations[0]);
				}

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

		if (!selectedLocation) {
			toast.error('Select a location before clocking in.');
			return;
		}

		if (selectedShiftSlot === '') {
			toast.error('Select a shift (1st, 2nd, or 3rd) before clocking in.');
			return;
		}

		if (!canSubmitClockIn({selectedLocation, selectedShiftSlot, isProcessing})) {
			return;
		}

		// Check if selfie is required
		if (isSelfieEnforced) {
			setSelfieAction('clockIn');
			setShowSelfieCapture(true);
			return;
		}

		const payload = buildClockInPayload(selectedLocation, selectedShiftSlot);
		if (!payload) {
			toast.error('Select a location and shift before clocking in.');
			return;
		}

		// Proceed without selfie
		setIsProcessing(true);
		try {
			const res = await fetch('/api/shifts/clock-in', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(payload),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.error || 'Failed to clock in');
			}

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

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.error || 'Failed to clock out');
			}

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
				// The house and shift slot selected before selfie capture opened
				// are preserved in component state and reused here unchanged
				// (see buildClockInPayload) -- selfie capture must never lose or
				// reset the identity the staff member already chose.
				const payload = buildClockInPayload(selectedLocation, selectedShiftSlot);
				if (!payload) {
					throw new Error('Select a location and shift before clocking in.');
				}

				res = await fetch('/api/shifts/clock-in', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({
						...payload,
						selfieStorageId: storageId,
					}),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => null);
					throw new Error(data?.error || 'Failed to clock in with selfie');
				}
				toast.success('Clocked in with selfie');
			} else if (selfieAction === 'clockOut') {
				res = await fetch('/api/shifts/clock-out', {
					method: 'POST',
					headers: {'Content-Type': 'application/json'},
					body: JSON.stringify({
						selfieStorageId: storageId,
					}),
				});
				if (!res.ok) {
					const data = await res.json().catch(() => null);
					throw new Error(data?.error || 'Failed to clock out with selfie');
				}
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

	const handleClassifyShift = async () => {
		if (!canSubmitClassification({selectedShiftSlot: classifyShiftSlot, isProcessing: isClassifying})) {
			if (classifyShiftSlot === '') {
				toast.error('Select a shift (1st, 2nd, or 3rd) to continue.');
			}
			return;
		}

		setIsClassifying(true);
		try {
			const res = await fetch('/api/shifts/current/classify', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({shiftSlot: classifyShiftSlot}),
			});

			if (!res.ok) {
				const data = await res.json().catch(() => null);
				throw new Error(data?.error || 'Failed to classify shift');
			}

			const shift = await res.json();
			setCurrentShift(shift);
			toast.success('Shift updated');
			onShiftChange?.();
		} catch (error: any) {
			toast.error(error.message || 'Failed to classify shift');
			// Reload the authoritative current shift so a failed/ambiguous
			// classification never leaves stale local state on screen.
			try {
				const shiftRes = await fetch('/api/shifts/current');
				const shift = await shiftRes.json();
				setCurrentShift(shift);
			} catch {
				// Ignore; the existing currentShift state is preserved.
			}
		} finally {
			setIsClassifying(false);
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
								{currentShift.shiftSlot ? (
									<p className="text-sm text-gray-600">
										Shift: {SHIFT_SLOT_LABELS[currentShift.shiftSlot as ShiftSlot]}
									</p>
								) : null}
								<p className="text-lg font-semibold text-gray-900">
									Duration: {formatDuration(currentShift.clockInTime)}
								</p>
							</div>

							{currentShift.needsClassification ? (
								<div className="max-w-xs mx-auto text-left bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
									<p className="text-sm text-amber-800">
										This shift was started before shift tracking was required.
										Select which shift you are working to continue.
									</p>
									<div>
										<label
											htmlFor="classify-shift-slot"
											className="block text-sm font-medium text-gray-700 mb-2">
											Shift
										</label>
										<select
											id="classify-shift-slot"
											value={classifyShiftSlot}
											onChange={(event) =>
												setClassifyShiftSlot(
													event.target.value
														? (Number(event.target.value) as ShiftSlot)
														: ''
												)
											}
											disabled={isClassifying}
											className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 disabled:opacity-50">
											<option value="">Select a shift</option>
											{SHIFT_SLOTS.map((slot) => (
												<option key={slot} value={slot}>
													{SHIFT_SLOT_LABELS[slot]}
												</option>
											))}
										</select>
									</div>
									<button
										onClick={handleClassifyShift}
										disabled={
											!canSubmitClassification({
												selectedShiftSlot: classifyShiftSlot,
												isProcessing: isClassifying,
											})
										}
										className="w-full bg-amber-600 text-white py-2 px-4 rounded-lg hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium">
										{isClassifying ? 'Saving...' : 'Confirm Shift'}
									</button>
								</div>
							) : null}

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
								<div className="space-y-4">
									{sessionInfo.locations.length > 1 ? (
										<div className="max-w-xs mx-auto text-left">
											<label
												htmlFor="clock-in-location"
												className="block text-sm font-medium text-gray-700 mb-2">
												Clock-in location
											</label>
											<select
												id="clock-in-location"
												value={selectedLocation}
												onChange={(event) => setSelectedLocation(event.target.value)}
												disabled={isProcessing}
												className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:opacity-50">
												{sessionInfo.locations.map((location: string) => (
													<option key={location} value={location}>
														{location}
													</option>
												))}
											</select>
										</div>
									) : (
										<p className="text-sm text-gray-600">
											Assigned Location: {sessionInfo.locations[0]}
										</p>
									)}

									<div className="max-w-xs mx-auto text-left">
										<label
											htmlFor="clock-in-shift-slot"
											className="block text-sm font-medium text-gray-700 mb-2">
											Shift
										</label>
										<select
											id="clock-in-shift-slot"
											value={selectedShiftSlot}
											onChange={(event) =>
												setSelectedShiftSlot(
													event.target.value
														? (Number(event.target.value) as ShiftSlot)
														: ''
												)
											}
											disabled={isProcessing}
											className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-900 shadow-sm focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 disabled:opacity-50">
											<option value="">Select a shift</option>
											{SHIFT_SLOTS.map((slot) => (
												<option key={slot} value={slot}>
													{SHIFT_SLOT_LABELS[slot]}
												</option>
											))}
										</select>
									</div>

									<button
										onClick={handleClockIn}
										disabled={
											!canSubmitClockIn({selectedLocation, selectedShiftSlot, isProcessing})
										}
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
