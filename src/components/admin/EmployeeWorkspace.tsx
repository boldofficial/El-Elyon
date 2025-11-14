/* eslint-disable @typescript-eslint/no-misused-promises */
import {useMutation, useQuery, useAction} from 'convex/react';
import {api} from '../../convex/_generated/api';
import {useState} from 'react';
import {Id} from '../../convex/_generated/dataModel';
import {toast} from 'sonner';

export default function EmployeeWorkspace() {
	const userRole = useQuery(api.settings.getUserRole);
	const employees =
		useQuery(
			api.employees.listEmployees,
			userRole?.role === 'admin' ? {} : 'skip'
		) || [];
	const availableLocations =
		useQuery(api.employees.getAvailableLocations) || [];
	const devices = useQuery(api.devices.listDevices, {}) || []; // ✅ Get available devices

	const [selectedEmployee, setSelectedEmployee] =
		useState<Id<'employees'> | null>(null);
	const [showAddForm, setShowAddForm] = useState(false);
	const [showEditForm, setShowEditForm] = useState(false);
	const [deletingId, setDeletingId] = useState<Id<'employees'> | null>(null);
	// const [activeTab, setActiveTab] = useState<
	//   'directory' | 'activities' | 'logs'
	// >('directory');

	const createEmployee = useAction(api.employees.createEmployee);
	const deleteEmployee = useMutation(api.employees.deleteEmployee);
	const updateEmployee = useMutation(api.employees.updateEmployee);

	const [newEmployeeForm, setNewEmployeeForm] = useState({
		name: '',
		email: '',
		role: 'staff' as 'admin' | 'supervisor' | 'staff',
		locations: [] as string[],
		assignedDeviceId: undefined as string | undefined, // ✅ Add device field
	});

	const [editEmployeeForm, setEditEmployeeForm] = useState({
		name: '',
		email: '',
		role: 'staff' as 'admin' | 'supervisor' | 'staff',
		locations: [] as string[],
		assignedDeviceId: undefined as string | undefined, // ✅ Add device field
	});

	async function handleAddEmployee(e: React.FormEvent) {
		e.preventDefault();
		if (!newEmployeeForm.name.trim() || !newEmployeeForm.email.trim()) {
			toast.error('Name and email are required');
			return;
		}

		// if (newEmployeeForm.locations.length === 0) {
		// 	toast.error('Please select at least one location');
		// 	return;
		// }

		try {
			const result = await createEmployee({
				name: newEmployeeForm.name.trim(),
				email: newEmployeeForm.email.trim(),
				role: newEmployeeForm.role,
				locations: newEmployeeForm.locations,
				assignedDeviceId: newEmployeeForm.assignedDeviceId,
			});

			setNewEmployeeForm({
				name: '',
				email: '',
				role: 'staff',
				locations: [],
				assignedDeviceId: undefined,
			});
			setShowAddForm(false);

			toast.success('Employee account created! Credentials sent via email.');

			// Show the generated password in console for admin reference (optional)
			if (result.generatedPassword) {
				console.log(
					'🔑 Generated password for',
					newEmployeeForm.email,
					':',
					result.generatedPassword
				);
			}
		} catch (error: any) {
			toast.error(error.message || 'Failed to create employee');
		}
	}

	const handleLocationToggle = (location: string) => {
		setNewEmployeeForm((prev) => ({
			...prev,
			locations: prev.locations.includes(location)
				? prev.locations.filter((l) => l !== location)
				: [...prev.locations, location],
		}));
	};

	async function handleDeleteEmployee(employeeId: Id<'employees'>) {
		if (
			!window.confirm(
				'Are you sure you want to delete this employee? This will also delete their Clerk account.'
			)
		) {
			return;
		}
		setDeletingId(employeeId);
		try {
			await deleteEmployee({employeeId});
			toast.success('Employee deleted.');
			if (selectedEmployee === employeeId) setSelectedEmployee(null);
		} catch (error: any) {
			toast.error(error?.message || 'Failed to delete employee');
		} finally {
			setDeletingId(null);
		}
	}

	const handleEditEmployee = (employee: any) => {
		setEditEmployeeForm({
			name: employee.name,
			email: employee.email || employee.workEmail,
			role: employee.role || 'staff',
			locations: employee.locations || [],
			assignedDeviceId: employee.assignedDeviceId,
		});
		setSelectedEmployee(employee.id);
		setShowEditForm(true);
	};

	const handleEditLocationToggle = (location: string) => {
		setEditEmployeeForm((prev) => ({
			...prev,
			locations: prev.locations.includes(location)
				? prev.locations.filter((l) => l !== location)
				: [...prev.locations, location],
		}));
	};

	async function handleUpdateEmployee(e: React.FormEvent) {
		e.preventDefault();
		if (!selectedEmployee) return;
		try {
			await updateEmployee({
				employeeId: selectedEmployee,
				name: editEmployeeForm.name,
				email: editEmployeeForm.email,
				role: editEmployeeForm.role,
				locations: editEmployeeForm.locations,
				assignedDeviceId: editEmployeeForm.assignedDeviceId,
			});
			setShowEditForm(false);
			setSelectedEmployee(null);
			toast.success('Employee updated successfully!');
		} catch (error) {
			toast.error('Failed to update employee');
			console.error(error);
		}
	}

	// const isAdmin = userRole?.role === 'admin';

	function renderUserStatus(emp: any) {
		if (emp.clerkUserId) {
			return (
				<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 ml-2">
					✅ Active
				</span>
			);
		}
		return (
			<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 ml-2">
				⏳ Pending
			</span>
		);
	}

	// Get device name helper
	const getDeviceName = (deviceId?: string) => {
		if (!deviceId) return 'No device assigned';
		const device = devices.find((d) => d.deviceId === deviceId);
		return device ? device.deviceName : deviceId.substring(0, 20) + '...';
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<h2 className="text-xl font-semibold">
					Employees ({employees.length})
				</h2>
				<button
					className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
					onClick={() => setShowAddForm(!showAddForm)}>
					{showAddForm ? 'Cancel' : '+ Add Employee'}
				</button>
			</div>

			{/* Info note */}
			<div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
				<strong>ℹ️ How it works:</strong> When you create an employee, a Clerk
				account is created automatically and they receive an email with their
				login credentials (email + temporary password). They should change their
				password after first login.
			</div>

			{/* Edit Employee Form */}
			{showEditForm && selectedEmployee && (
				<div className="bg-white rounded-lg shadow-sm border p-6 mb-4">
					<h3 className="text-lg font-semibold mb-4">Edit Employee</h3>
					<form onSubmit={handleUpdateEmployee} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Name
								<span className="text-red-500">*</span>
							</label>
							<input
								type="text"
								value={editEmployeeForm.name}
								onChange={(e) =>
									setEditEmployeeForm((prev) => ({
										...prev,
										name: e.target.value,
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								required
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Email <span className="text-red-500">*</span>
							</label>
							<input
								type="email"
								value={editEmployeeForm.email}
								onChange={(e) =>
									setEditEmployeeForm((prev) => ({
										...prev,
										email: e.target.value,
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								required
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Role
							</label>
							<select
								value={editEmployeeForm.role}
								onChange={(e) =>
									setEditEmployeeForm((prev) => ({
										...prev,
										role: e.target.value as any,
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="staff">Staff</option>
								<option value="supervisor">Supervisor</option>
								<option value="admin">Admin</option>
							</select>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Assigned Device
							</label>
							<select
								value={editEmployeeForm.assignedDeviceId || ''}
								onChange={(e) =>
									setEditEmployeeForm((prev) => ({
										...prev,
										assignedDeviceId: e.target.value || undefined,
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="">
									No device restriction (can login anywhere)
								</option>
								{devices.map((device) => (
									<option key={device.deviceId} value={device.deviceId}>
										{device.deviceName} - {device.location}
									</option>
								))}
							</select>
							<p className="text-xs text-gray-500 mt-1">
								If no device is assigned, user can login from any device. Admins
								are always unrestricted.
							</p>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Locations
							</label>
							<div className="flex flex-wrap gap-2">
								{availableLocations.map((loc: string) => (
									<label
										key={loc}
										className={`px-3 py-1 rounded border cursor-pointer ${
											editEmployeeForm.locations.includes(loc)
												? 'bg-blue-100 border-blue-400'
												: 'bg-white border-gray-300'
										}`}>
										<input
											type="checkbox"
											checked={editEmployeeForm.locations.includes(loc)}
											onChange={() => handleEditLocationToggle(loc)}
											className="mr-2"
										/>
										{loc}
									</label>
								))}
							</div>
						</div>
						<div className="flex gap-2">
							<button
								type="submit"
								className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
								Update Employee
							</button>
							<button
								type="button"
								onClick={() => {
									setShowEditForm(false);
									setSelectedEmployee(null);
								}}
								className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Add Employee Form */}
			{showAddForm && (
				<div className="bg-white rounded-lg shadow-sm border p-6 mb-4">
					<h3 className="text-lg font-semibold mb-4">Add New Employee</h3>
					<form onSubmit={handleAddEmployee} className="space-y-4">
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Name <span className="text-red-500">*</span>
							</label>
							<input
								type="text"
								value={newEmployeeForm.name}
								onChange={(e) =>
									setNewEmployeeForm((prev) => ({
										...prev,
										name: e.target.value,
									}))
								}
								placeholder="John Doe"
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								required
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Email <span className="text-red-500">*</span>
							</label>
							<input
								type="email"
								value={newEmployeeForm.email}
								onChange={(e) =>
									setNewEmployeeForm((prev) => ({
										...prev,
										email: e.target.value,
									}))
								}
								placeholder="john@example.com"
								className="w-full border border-gray-300 rounded-md px-3 py-2"
								required
							/>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Role
							</label>
							<select
								value={newEmployeeForm.role}
								onChange={(e) =>
									setNewEmployeeForm((prev) => ({
										...prev,
										role: e.target.value as 'admin' | 'supervisor' | 'staff',
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="staff">Staff</option>
								<option value="supervisor">Supervisor</option>
								<option value="admin">Admin</option>
							</select>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Assigned Device
							</label>
							<select
								value={newEmployeeForm.assignedDeviceId || ''}
								onChange={(e) =>
									setNewEmployeeForm((prev) => ({
										...prev,
										assignedDeviceId: e.target.value || undefined,
									}))
								}
								className="w-full border border-gray-300 rounded-md px-3 py-2">
								<option value="">
									No device restriction (can login anywhere)
								</option>
								{devices.map((device) => (
									<option key={device.deviceId} value={device.deviceId}>
										{device.deviceName} - {device.location}
									</option>
								))}
							</select>
							<p className="text-xs text-gray-500 mt-1">
								Optional: Restrict this employee to a specific device. Leave
								empty for no restriction.
							</p>
						</div>
						<div>
							<label className="block text-sm font-medium text-gray-700 mb-2">
								Locations <span className="text-red-500">*</span>
							</label>
							<div className="flex flex-wrap gap-2">
								{availableLocations.map((loc: string) => (
									<label
										key={loc}
										className={`px-3 py-1 rounded border cursor-pointer ${
											newEmployeeForm.locations.includes(loc)
												? 'bg-blue-100 border-blue-400'
												: 'bg-white border-gray-300'
										}`}>
										<input
											type="checkbox"
											checked={newEmployeeForm.locations.includes(loc)}
											onChange={() => handleLocationToggle(loc)}
											className="mr-2"
										/>
										{loc}
									</label>
								))}
							</div>
						</div>
						<div className="flex gap-2">
							<button
								type="submit"
								className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
								Create Employee
							</button>
							<button
								type="button"
								onClick={() => setShowAddForm(false)}
								className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors">
								Cancel
							</button>
						</div>
					</form>
				</div>
			)}

			{/* Employees List */}
			<div className="bg-white rounded-lg shadow-sm border overflow-hidden">
				<div className="px-6 py-4 border-b border-gray-200">
					<h3 className="text-lg font-semibold">Employee Directory</h3>
				</div>
				{employees.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						<div className="text-4xl mb-4">👥</div>
						<p className="text-lg font-medium mb-2">No employees yet</p>
						<p className="text-sm">Add your first employee to get started</p>
					</div>
				) : (
					<div className="divide-y divide-gray-200">
						{employees.map((emp) => (
							<div key={emp.id} className="p-6">
								<div className="flex items-start justify-between">
									<div className="flex-1">
										<h4 className="text-lg font-medium text-gray-900">
											{emp.name}
											{renderUserStatus(emp)}
										</h4>
										<p className="text-sm text-gray-600 mt-1">
											{emp.email || emp.workEmail}
										</p>
										<div className="mt-2 flex items-center space-x-4 text-sm">
											<span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
												{emp.role || 'staff'}
											</span>
											<span className="text-gray-500">
												{emp.locations && emp.locations.length > 0
													? emp.locations.join(', ')
													: 'No locations'}
											</span>
										</div>
										<div className="mt-2 text-sm text-gray-500">
											<strong>Device:</strong>{' '}
											{getDeviceName(emp.assignedDeviceId)}
										</div>
									</div>
									<div className="flex flex-col space-y-2 ml-4">
										<button
											onClick={() => handleEditEmployee(emp)}
											className="px-3 py-1 text-sm text-blue-600 hover:text-blue-800 border border-blue-300 rounded hover:bg-blue-50 whitespace-nowrap">
											Edit
										</button>
										<button
											onClick={() => handleDeleteEmployee(emp.id)}
											disabled={deletingId === emp.id}
											className="px-3 py-1 text-sm text-red-600 hover:text-red-800 border border-red-300 rounded hover:bg-red-50 disabled:opacity-50 whitespace-nowrap">
											{deletingId === emp.id ? 'Deleting...' : 'Delete'}
										</button>
									</div>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
