'use client';

import React, {useState, useEffect, useCallback} from 'react';
import {toast} from 'sonner';

interface Device {
	id: string;
	deviceId: string;
	deviceName: string;
	location: string;
	deviceType: 'kiosk' | 'mobile' | 'desktop';
	isActive: boolean;
	lastUsedAt: number | null;
	metadata: {
		browser?: string;
		os?: string;
		screenResolution?: string;
	};
	notes?: string;
}

interface Location {
	_id: string;
	name: string;
}

export default function DeviceManagementWorkspace() {
	const [showRegisterForm, setShowRegisterForm] = useState(false);
	const [selectedLocation, setSelectedLocation] = useState<
		string | undefined
	>();
	const [devices, setDevices] = useState<Device[] | undefined>(undefined);
	const [locations, setLocations] = useState<Location[] | undefined>(undefined);
	const [loading, setLoading] = useState(true);

	const fetchDevices = useCallback(async () => {
		try {
			const query = selectedLocation ? `?location=${selectedLocation}` : '';
			const res = await fetch(`/api/admin/kiosks/list${query}`);
			if (!res.ok) {
				throw new Error(`HTTP error! status: ${res.status}`);
			}
			const data: Device[] = await res.json();
			setDevices(data);
		} catch (error: any) {
			console.error('Error fetching devices:', error);
			toast.error('Failed to load devices.');
			setDevices([]);
		}
	}, [selectedLocation]);

	const fetchLocations = useCallback(async () => {
		try {
			const res = await fetch('/api/admin/locations');
			if (!res.ok) {
				throw new Error(`HTTP error! status: ${res.status}`);
			}
			const data: Location[] = await res.json();
			setLocations(data);
		} catch (error: any) {
			console.error('Error fetching locations:', error);
			toast.error('Failed to load locations.');
			setLocations([]);
		}
	}, []);

	useEffect(() => {
		setLoading(true);
		Promise.all([fetchDevices(), fetchLocations()]).finally(() =>
			setLoading(false)
		);
	}, [fetchDevices, fetchLocations]);

	const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		const form = e.currentTarget;
		const formData = new FormData(form);

		const newDevice = {
			deviceId: formData.get('deviceId') as string,
			deviceName: formData.get('deviceName') as string,
			location: formData.get('location') as string,
			deviceType: formData.get('deviceType') as
				| 'kiosk'
				| 'mobile'
				| 'desktop',
			metadata: {
				browser: formData.get('browser') as string,
				os: formData.get('os') as string,
				screenResolution: formData.get('screenResolution') as string,
			},
			notes: formData.get('notes') as string,
		};

		try {
			const res = await fetch('/api/admin/kiosks', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(newDevice),
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to register device');
			}

			toast.success('Device registered successfully');
			setShowRegisterForm(false);
			form.reset();
			await fetchDevices(); // Refresh devices list
		} catch (error: any) {
			toast.error(error.message || 'Failed to register device');
		}
	};

	const handleToggleStatus = async (
		id: string, // Use internal ID for update/delete
		currentStatus: boolean
	) => {
		try {
			const res = await fetch(`/api/admin/kiosks/${id}`, {
				method: 'PATCH',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({isActive: !currentStatus}),
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to update device status');
			}

			toast.success(`Device ${!currentStatus ? 'activated' : 'deactivated'}`);
			await fetchDevices(); // Refresh devices list
		} catch (error: any) {
			toast.error(error.message || 'Failed to update device status');
		}
	};

	const handleDelete = async (id: string) => {
		if (!confirm('Are you sure you want to delete this device?')) return;

		try {
			const res = await fetch(`/api/admin/kiosks/${id}`, {
				method: 'DELETE',
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to delete device');
			}

			toast.success('Device deleted successfully');
			await fetchDevices(); // Refresh devices list
		} catch (error: any) {
			toast.error(error.message || 'Failed to delete device');
		}
	};

	if (loading || devices === undefined || locations === undefined) {
		return (
			<div className="flex items-center justify-center py-12">
				<div className="text-center">
					<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading devices...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex justify-between items-center">
				<div>
					<h2 className="text-2xl font-bold text-gray-900">
						Device Management
					</h2>
					<p className="text-gray-600 mt-1">
						Manage authorized devices that can access the system
					</p>
				</div>
				<button
					onClick={() => setShowRegisterForm(!showRegisterForm)}
					className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
					{showRegisterForm ? 'Cancel' : '+ Register Device'}
				</button>
			</div>

			{/* Filter */}
			<div className="flex gap-4 items-center">
				<label htmlFor="location-filter" className="text-sm font-medium text-gray-700">
					Filter by location:
				</label>
				<select
					id="location-filter"
					value={selectedLocation || ''}
					onChange={(e) => setSelectedLocation(e.target.value || undefined)}
					className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
					<option value="">All Locations</option>
					{locations.map((loc) => (
						<option key={loc._id} value={loc.name}>
							{loc.name}
						</option>
					))}
				</select>
			</div>

			{/* Registration Form */}
			{showRegisterForm && (
				<div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
					<h3 className="text-lg font-semibold mb-4">Register New Device</h3>
					<form onSubmit={handleRegister} className="space-y-4">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<label htmlFor="deviceId" className="block text-sm font-medium text-gray-700 mb-1">
									Device ID *
								</label>
								<input
									type="text"
									id="deviceId"
									name="deviceId"
									required
									placeholder="device_abc123..."
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								/>
								<p className="text-xs text-gray-500 mt-1">
									Get this from the device's browser console
								</p>
							</div>

							<div>
								<label htmlFor="deviceName" className="block text-sm font-medium text-gray-700 mb-1">
									Device Name *
								</label>
								<input
									type="text"
									id="deviceName"
									name="deviceName"
									required
									placeholder="Kiosk 1 - Front Desk"
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								/>
							</div>

							<div>
								<label htmlFor="location" className="block text-sm font-medium text-gray-700 mb-1">
									Location *
								</label>
								<select
									id="location"
									name="location"
									required
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
									<option value="">Select location</option>
									{locations.map((loc) => (
										<option key={loc._id} value={loc.name || ''}>
											{loc.name || ''}
										</option>
									))}
								</select>
							</div>

							<div>
								<label htmlFor="deviceType" className="block text-sm font-medium text-gray-700 mb-1">
									Device Type *
								</label>
								<select
									id="deviceType"
									name="deviceType"
									required
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
									<option value="kiosk">Kiosk</option>
									<option value="desktop">Desktop</option>
									<option value="mobile">Mobile</option>
								</select>
							</div>

							<div>
								<label htmlFor="browser" className="block text-sm font-medium text-gray-700 mb-1">
									Browser
								</label>
								<input
									type="text"
									id="browser"
									name="browser"
									placeholder="Chrome 120.0"
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								/>
							</div>

							<div>
								<label htmlFor="os" className="block text-sm font-medium text-gray-700 mb-1">
									Operating System
								</label>
								<input
									type="text"
									id="os"
									name="os"
									placeholder="Windows 11"
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								/>
							</div>

							<div>
								<label htmlFor="screenResolution" className="block text-sm font-medium text-gray-700 mb-1">
									Screen Resolution
								</label>
								<input
									type="text"
									id="screenResolution"
									name="screenResolution"
									placeholder="1920x1080"
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								/>
							</div>
						</div>

						<div>
								<label htmlFor="notes" className="block text-sm font-medium text-gray-700 mb-1">
									Notes
								</label>
								<textarea
									id="notes"
									name="notes"
									rows={3}
									placeholder="Additional information about this device..."
									className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
								/>
						</div>

						<div className="flex justify-end gap-3">
							<button
								type="button"
								onClick={() => setShowRegisterForm(false)}
								className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
								Cancel
							</button>
							<button
								type="submit"
								className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
								Register Device
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Devices List */}
			<div className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
				<table className="w-full">
					<thead className="bg-gray-50 border-b border-gray-200">
						<tr>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Device Name
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Device ID
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Location
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Type
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Status
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Last Used
							</th>
							<th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
								Actions
							</th>
						</tr>
					</thead>
					<tbody className="bg-white divide-y divide-gray-200">
						{devices.length === 0 ? (
							<tr>
								<td
									colSpan={7}
									className="px-6 py-12 text-center text-gray-500">
									No devices registered yet. Click "Register Device" to add one.
								</td>
							</tr>
						) : (
							devices.map((device) => (
								<tr key={device.id} className="hover:bg-gray-50">
									<td className="px-6 py-4 whitespace-nowrap">
										<div className="font-medium text-gray-900">
											{device.deviceName}
										</div>
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<code className="text-xs bg-gray-100 px-2 py-1 rounded">
											{device.deviceId.substring(0, 20)}&hellip;
										</code>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
										{device.location}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
										{device.deviceType || 'desktop'}
									</td>
									<td className="px-6 py-4 whitespace-nowrap">
										<span
											className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
												device.isActive
													? 'bg-green-100 text-green-800'
													: 'bg-red-100 text-red-800'
											}`}>
											{device.isActive ? 'Active' : 'Inactive'}
										</span>
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
										{device.lastUsedAt
											? new Date(device.lastUsedAt).toLocaleString()
											: 'Never'}
									</td>
									<td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
										<button
											onClick={() =>
												handleToggleStatus(device.id, device.isActive)
											}
											className={`${
												device.isActive
													? 'text-orange-600 hover:text-orange-900'
													: 'text-green-600 hover:text-green-900'
											}`}>
											{device.isActive ? 'Deactivate' : 'Activate'}
										</button>
										<button
											onClick={() => handleDelete(device.id)}
											className="text-red-600 hover:text-red-900">
											Delete
										</button>
									</td>
								</tr>
							))
						)}
					</tbody>
				</table>
			</div>

			{/* Device ID Helper */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
				<h4 className="font-semibold text-blue-900 mb-2">
					&#128221; How to get Device ID
				</h4>
				<p className="text-sm text-blue-800 mb-3">
					On the device you want to register, open the browser console (F12) and
					run:
				</p>
				<code className="block bg-blue-100 p-3 rounded text-sm font-mono text-blue-900">
					localStorage.getItem('kiosk_device_id')
				</code>
				<p className="text-xs text-blue-700 mt-2">
					Copy the result and paste it in the "Device ID" field above.
				</p>
			</div>
		</div>
	);
}
