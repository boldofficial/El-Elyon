'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';
import {useUser} from '@clerk/nextjs';

export default function CareProfileWorkspace() {
	const {user: clerkUser} = useUser();
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [pendingAcknowledgments, setPendingAcknowledgments] = useState<any[]>([]);
	const [processingAck, setProcessingAck] = useState<string | null>(null);
	
	// Edit name state - separate first/last name
	const [isEditingName, setIsEditingName] = useState(false);
	const [editFirstName, setEditFirstName] = useState('');
	const [editLastName, setEditLastName] = useState('');
	const [isSavingName, setIsSavingName] = useState(false);
	
	// Change password state
	const [isChangingPassword, setIsChangingPassword] = useState(false);
	const [currentPassword, setCurrentPassword] = useState('');
	const [newPassword, setNewPassword] = useState('');
	const [confirmPassword, setConfirmPassword] = useState('');
	const [isSavingPassword, setIsSavingPassword] = useState(false);

	useEffect(() => {
		async function fetchData() {
			try {
				const sessionRes = await fetch('/api/access/session');
				const session = await sessionRes.json();
				setSessionInfo(session);
				
				// Parse name into first/last
				const fullName = session?.user?.name || '';
				const nameParts = fullName.split(' ');
				setEditFirstName(nameParts[0] || '');
				setEditLastName(nameParts.slice(1).join(' ') || '');

				const ackRes = await fetch('/api/care/pending-acknowledgments');
				const acks = await ackRes.json();
				setPendingAcknowledgments(acks);
			} catch (error) {
				console.error('Error fetching profile data:', error);
			}
		}

		fetchData();
	}, []);

	const handleAcknowledge = async (residentId: string, ispId: string) => {
		setProcessingAck(ispId);
		try {
			const res = await fetch('/api/care/acknowledge-isp', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({residentId, ispId}),
			});

			if (!res.ok) throw new Error('Failed to acknowledge ISP');

			toast.success('ISP acknowledged successfully');

			const ackRes = await fetch('/api/care/pending-acknowledgments');
			const acks = await ackRes.json();
			setPendingAcknowledgments(acks);
		} catch (error) {
			toast.error('Failed to acknowledge ISP');
			console.error('Error acknowledging ISP:', error);
		} finally {
			setProcessingAck(null);
		}
	};

	const handleSaveName = async () => {
		if (!editFirstName.trim()) {
			toast.error('First name is required');
			return;
		}
		if (!editLastName.trim()) {
			toast.error('Last name is required');
			return;
		}

		setIsSavingName(true);
		try {
			const res = await fetch('/api/users/update-profile', {
				method: 'PUT',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					firstName: editFirstName.trim(),
					lastName: editLastName.trim(),
				}),
			});

			const data = await res.json();

			if (!res.ok) {
				throw new Error(data.error || 'Failed to update name');
			}

			if (data.warning) {
				toast.success('Name updated', {description: data.warning});
			} else {
				toast.success('Name updated successfully');
			}
			setIsEditingName(false);

			// Refresh session info
			const sessionRes = await fetch('/api/access/session');
			const session = await sessionRes.json();
			setSessionInfo(session);
		} catch (error: any) {
			toast.error(error.message || 'Failed to update name');
		} finally {
			setIsSavingName(false);
		}
	};

	const handleChangePassword = async () => {
		if (!currentPassword || !newPassword || !confirmPassword) {
			toast.error('Please fill in all password fields');
			return;
		}

		if (newPassword !== confirmPassword) {
			toast.error('New passwords do not match');
			return;
		}

		if (newPassword.length < 8) {
			toast.error('Password must be at least 8 characters');
			return;
		}

		setIsSavingPassword(true);
		try {
			await clerkUser?.updatePassword({
				currentPassword,
				newPassword,
			});

			toast.success('Password changed successfully');
			setIsChangingPassword(false);
			setCurrentPassword('');
			setNewPassword('');
			setConfirmPassword('');
		} catch (error: any) {
			console.error('Error changing password:', error);
			const errorMessage = error?.errors?.[0]?.longMessage || error?.message || 'Failed to change password';
			toast.error(errorMessage);
		} finally {
			setIsSavingPassword(false);
		}
	};

	const cancelEditName = () => {
		setIsEditingName(false);
		const fullName = sessionInfo?.user?.name || '';
		const nameParts = fullName.split(' ');
		setEditFirstName(nameParts[0] || '');
		setEditLastName(nameParts.slice(1).join(' ') || '');
	};

	return (
		<div className="space-y-6">
			<div className="text-center">
				<h2 className="text-2xl font-bold text-gray-900 mb-2">My Profile</h2>
				<p className="text-gray-600">
					Credentials and required acknowledgments
				</p>
			</div>

			{/* User Information - Editable */}
			<div className="bg-white rounded-lg shadow-sm border p-6">
				<div className="flex items-center justify-between mb-4">
					<h3 className="text-lg font-semibold">User Information</h3>
					{!isEditingName && !isChangingPassword && (
						<button
							onClick={() => setIsEditingName(true)}
							className="text-blue-600 hover:text-blue-700 text-sm font-medium"
						>
							Edit Profile
						</button>
					)}
				</div>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					{/* First Name Field */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							First Name
						</label>
						{isEditingName ? (
							<input
								type="text"
								value={editFirstName}
								onChange={(e) => setEditFirstName(e.target.value)}
								className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
								placeholder="Enter first name"
							/>
						) : (
							<p className="text-gray-900">
								{sessionInfo?.user?.name?.split(' ')[0] || 'Not provided'}
							</p>
						)}
					</div>

					{/* Last Name Field */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Last Name
						</label>
						{isEditingName ? (
							<input
								type="text"
								value={editLastName}
								onChange={(e) => setEditLastName(e.target.value)}
								className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
								placeholder="Enter last name"
							/>
						) : (
							<p className="text-gray-900">
								{sessionInfo?.user?.name?.split(' ').slice(1).join(' ') || 'Not provided'}
							</p>
						)}
					</div>

					{/* Save/Cancel buttons for name editing */}
					{isEditingName && (
						<div className="md:col-span-2 flex space-x-2">
							<button
								onClick={handleSaveName}
								disabled={isSavingName}
								className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
							>
								{isSavingName ? 'Saving...' : 'Save Changes'}
							</button>
							<button
								onClick={cancelEditName}
								disabled={isSavingName}
								className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
							>
								Cancel
							</button>
						</div>
					)}

					{/* Email Field (Read-only) */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Email
						</label>
						<p className="text-gray-900">
							{sessionInfo?.user?.email || 'Not provided'}
						</p>
						<p className="text-xs text-gray-500 mt-1">
							Contact admin to change email
						</p>
					</div>

					{/* Role (Read-only) */}
					<div>
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Role
						</label>
						<p className="text-gray-900 capitalize">
							{sessionInfo?.role || 'Not assigned'}
						</p>
					</div>

					{/* Assigned Locations (Read-only) */}
					<div className="md:col-span-2">
						<label className="block text-sm font-medium text-gray-700 mb-1">
							Assigned Locations
						</label>
						<p className="text-gray-900">
							{sessionInfo?.locations?.length
								? sessionInfo.locations.join(', ')
								: 'No locations assigned'}
						</p>
					</div>
				</div>

				{/* Password Section */}
				<div className="mt-6 pt-6 border-t border-gray-200">
					<div className="flex items-center justify-between mb-4">
						<div>
							<h4 className="font-semibold text-gray-900">Password</h4>
							<p className="text-sm text-gray-600">
								Change your account password
							</p>
						</div>
						{!isChangingPassword && !isEditingName && (
							<button
								onClick={() => setIsChangingPassword(true)}
								className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm font-medium"
							>
								Change Password
							</button>
						)}
					</div>

					{isChangingPassword && (
						<div className="space-y-4 max-w-md">
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Current Password
								</label>
								<input
									type="password"
									value={currentPassword}
									onChange={(e) => setCurrentPassword(e.target.value)}
									className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="Enter current password"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									New Password
								</label>
								<input
									type="password"
									value={newPassword}
									onChange={(e) => setNewPassword(e.target.value)}
									className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="Enter new password (min 8 characters)"
								/>
							</div>
							<div>
								<label className="block text-sm font-medium text-gray-700 mb-1">
									Confirm New Password
								</label>
								<input
									type="password"
									value={confirmPassword}
									onChange={(e) => setConfirmPassword(e.target.value)}
									className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
									placeholder="Confirm new password"
								/>
							</div>
							<div className="flex space-x-2">
								<button
									onClick={handleChangePassword}
									disabled={isSavingPassword}
									className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
								>
									{isSavingPassword ? 'Changing...' : 'Change Password'}
								</button>
								<button
									onClick={() => {
										setIsChangingPassword(false);
										setCurrentPassword('');
										setNewPassword('');
										setConfirmPassword('');
									}}
									disabled={isSavingPassword}
									className="px-4 py-2 bg-gray-200 text-gray-700 text-sm rounded-md hover:bg-gray-300"
								>
									Cancel
								</button>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Required Acknowledgments */}
			<div className="bg-white rounded-lg shadow-sm border">
				<div className="px-6 py-4 border-b border-gray-200">
					<h3 className="text-lg font-semibold">Required Acknowledgments</h3>
					<p className="text-sm text-gray-600 mt-1">
						You must acknowledge these ISPs before creating logs for these
						residents
					</p>
				</div>

				{pendingAcknowledgments.length === 0 ? (
					<div className="p-8 text-center text-gray-500">
						<div className="text-4xl mb-4">✅</div>
						<p className="text-lg font-medium mb-2">All Caught Up!</p>
						<p className="text-sm">No pending ISP acknowledgments</p>
					</div>
				) : (
					<div className="divide-y divide-gray-200">
						{pendingAcknowledgments.map((item: any) => (
							<div key={item.ispId} className="p-6">
								<div className="flex items-center justify-between">
									<div className="flex-1">
										<div className="flex items-center space-x-3 mb-2">
											<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
												Resident {item.residentNeutralId}
											</span>
											<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
												ISP Version {item.ispVersion}
											</span>
										</div>

										<p className="text-sm text-gray-600 mb-1">
											Location: {item.location}
										</p>
										<p className="text-sm text-gray-600">
											Due: {new Date(item.dueAt).toLocaleDateString()}
										</p>
									</div>

									<button
										onClick={() =>
											handleAcknowledge(item.residentId, item.ispId)
										}
										disabled={processingAck === item.ispId}
										className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
										{processingAck === item.ispId
											? 'Acknowledging...'
											: 'Acknowledge'}
									</button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Profile Guidelines */}
			<div className="bg-blue-50 rounded-lg border border-blue-200 p-6">
				<h3 className="font-semibold text-blue-900 mb-3">Profile Guidelines</h3>
				<ul className="space-y-2 text-sm text-blue-800">
					<li className="flex items-start">
						<span className="mr-2">•</span>
						<span>
							Keep your contact information up to date with your supervisor
						</span>
					</li>
					<li className="flex items-start">
						<span className="mr-2">•</span>
						<span>Acknowledge ISPs promptly to ensure you can create logs</span>
					</li>
					<li className="flex items-start">
						<span className="mr-2">•</span>
						<span>
							Contact your supervisor if you need access to additional locations
						</span>
					</li>
					<li className="flex items-start">
						<span className="mr-2">•</span>
						<span>Report any issues with your account access immediately</span>
					</li>
				</ul>
			</div>
		</div>
	);
}
