import React, { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

interface Props {
	onSuccess: () => void;
	onCancel: () => void;
	availableLocations: string[];
}

interface Device {
	id: string; // Internal ID
	deviceId: string; // The actual device ID string
	deviceName: string;
	location: string;
	isActive: boolean;
}

export default function ImprovedEmployeeCreation({
	onSuccess,
	onCancel,
	availableLocations,
}: Props) {
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [role, setRole] = useState<'admin' | 'supervisor' | 'staff'>('staff');
	const [selectedLocations, setSelectedLocations] = useState<string[]>([]);
	const [selectedDeviceId, setSelectedDeviceId] = useState<string | undefined>(
		undefined
	);
	const [submitting, setSubmitting] = useState(false);
	const [availableDevices, setAvailableDevices] = useState<Device[] | null>(null);
	const [loadingDevices, setLoadingDevices] = useState(true);

	const fetchAvailableDevices = useCallback(async () => {
		setLoadingDevices(true);
		try {
			const res = await fetch('/api/admin/kiosks/list');
			if (!res.ok) {
				throw new Error(`HTTP error! status: ${res.status}`);
			}
			const data: Device[] = await res.json();
			setAvailableDevices(data.filter(device => device.isActive)); // Only show active devices
		} catch (error: any) {
			console.error('Error fetching available devices:', error);
			toast.error('Failed to load available devices.');
			setAvailableDevices([]);
		} finally {
			setLoadingDevices(false);
		}
	}, []);

	useEffect(() => {
		void fetchAvailableDevices();
	}, [fetchAvailableDevices]);

	function toggleLocation(location: string) {
		setSelectedLocations((prev) =>
			prev.includes(location)
				? prev.filter((l) => l !== location)
				: [...prev, location]
		);
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		if (!name.trim() || !email.trim()) {
			toast.error('Name and email are required');
			return;
		}

		if (selectedLocations.length === 0) {
			toast.error('Please select at least one location');
			return;
		}

		if (!selectedDeviceId) {
			toast.error('Please assign a device to the employee');
			return;
		}

		setSubmitting(true);
		try {
			const res = await fetch('/api/admin/employees', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					name: name.trim(),
					email: email.trim().toLowerCase(),
					role,
					locations: selectedLocations,
					assignedDeviceId: selectedDeviceId,
				}),
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to create employee');
			}

			const result = await res.json(); // Assuming API returns some result, e.g., generated password
			toast.success(
				result.message ||
					'Employee created successfully! Credentials sent via email.'
			);
			onSuccess();
		} catch (err: any) {
			toast.error(err.message || 'Failed to create employee');
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
			<div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
				<div className="p-6 border-b border-gray-200">
					<h2 className="text-2xl font-bold">Add New Employee</h2>
					<p className="text-gray-600 text-sm mt-1">
						Create a new employee account and assign a company device.
					</p>
				</div>

				<form onSubmit={(e) => void handleSubmit(e)} className="p-6 space-y-6">
					{/* Info: Employee Creation Flow */}
					<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
						<div className="flex items-start gap-3">
							<span className="text-2xl">📧</span>
							<div>
								<p className="font-medium text-blue-900">Employee Onboarding</p>
								<p className="text-sm text-blue-700">
									The employee will receive an email with their login
									credentials (email and a temporary password). They can only
									log in from the assigned company device.
								</p>
							</div>
						</div>
					</div>

					{/* Basic Info */}
					<div className="grid grid-cols-2 gap-4">
						<div>
							<label
								htmlFor="name"
								className="block text-sm font-medium text-gray-700 mb-2">
								Full Name *
							</label>
							<input
								id="name"
								type="text"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder="John Doe"
								className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
								disabled={submitting}
							/>
						</div>

						<div>
							<label
								htmlFor="email"
								className="block text-sm font-medium text-gray-700 mb-2">
								Email Address *
							</label>
							<input
								id="email"
								type="email"
								value={email}
								onChange={(e) => setEmail(e.target.value)}
								placeholder="john@example.com"
								className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
								disabled={submitting}
							/>
						</div>
					</div>

					{/* Role */}
					<div>
						<label
							htmlFor="role"
							className="block text-sm font-medium text-gray-700 mb-2">
							Role *
						</label>
						<select
							id="role"
							value={role}
							onChange={(e) => setRole(e.target.value as any)}
							className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
							required
							disabled={submitting}>
							<option value="staff">Care Staff</option>
							<option value="supervisor">Supervisor</option>
							<option value="admin">Administrator</option>
						</select>
					</div>

					{/* Assigned Device */}
					<div>
						<label
							htmlFor="assignedDevice"
							className="block text-sm font-medium text-gray-700 mb-2">
							Assign Company Kiosk Device *
						</label>
						{loadingDevices ? (
							<p className="text-sm text-gray-500 mt-1">
								Loading available devices...
							</p>
						) : (
							<select
								id="assignedDevice"
								value={selectedDeviceId || ''}
								onChange={(e) => setSelectedDeviceId(e.target.value || undefined)}
								className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
								required
								disabled={submitting || (availableDevices?.length === 0 && !selectedDeviceId)}>
								<option value="">Select a device</option>
								{availableDevices?.map((device) => (
									<option key={device.deviceId} value={device.deviceId}>
										{device.deviceName} ({device.location})
									</option>
								))}
							</select>
						)}
						{!loadingDevices && availableDevices?.length === 0 && (
							<p className="text-sm text-red-500 mt-1">
								No active kiosk devices found. Please register a kiosk first.
							</p>
						)}
					</div>

					{/* Locations */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-2">
							Assigned Locations *
						</label>
						<div className="border border-gray-300 rounded-lg p-4 max-h-48 overflow-y-auto">
							{availableLocations.length === 0 ? (
								<p className="text-gray-500 text-sm">No locations available</p>
							) : (
								<div className="space-y-2">
									{availableLocations.map((location) => (
										<label
											key={location}
											className="flex items-center gap-2 cursor-pointer">
											<input
												type="checkbox"
												checked={selectedLocations.includes(location)}
												onChange={() => toggleLocation(location)}
												className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
												disabled={submitting}
											/>
											<span className="text-sm">{location}</span>
										</label>
									))}
								</div>
							)}
						</div>
					</div>

					{/* Actions */}
					<div className="flex gap-3 pt-4 border-t border-gray-200">
						<button
							type="button"
							onClick={onCancel}
							disabled={submitting}
							className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors">
							Cancel
						</button>
						<button
							type="submit"
							disabled={
								submitting ||
								!selectedDeviceId ||
								(availableDevices?.length === 0 && !selectedDeviceId)
							}
							className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors">
							{submitting ? 'Creating Employee...' : 'Create Employee'}
						</button>
					</div>
				</form>
			</div>
		</div>
	);
}
