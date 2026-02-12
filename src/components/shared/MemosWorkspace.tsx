'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';
import {format} from 'date-fns';

interface Memo {
	memo: {
		id: string;
		title: string;
		content: string;
		senderName: string;
		senderClerkUserId: string;
		recipientType: string;
		targetLocations: string[];
		priority: string;
		createdAt: Date;
		expiresAt?: Date;
	};
	isRead: boolean;
}

export default function MemosWorkspace() {
	const [memos, setMemos] = useState<Memo[]>([]);
	const [loading, setLoading] = useState(true);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [selectedMemo, setSelectedMemo] = useState<Memo | null>(null);
	const [userRole, setUserRole] = useState<any>(null);
	const [filter, setFilter] = useState<'all' | 'unread'>('all');
	const [locations, setLocations] = useState<string[]>([]);

	useEffect(() => {
		fetchUserRole();
		fetchMemos();
	}, [filter]);

	const fetchUserRole = async () => {
		try {
			const res = await fetch('/api/users/current');
			if (res.ok) {
				const data = await res.json();
				setUserRole(data);
				setLocations(data.locations || []);
			}
		} catch (error) {
			console.error('Error fetching user role:', error);
		}
	};

	const fetchMemos = async () => {
		setLoading(true);
		try {
			const unreadParam = filter === 'unread' ? '&unreadOnly=true' : '';
			const res = await fetch(`/api/memos?limit=100${unreadParam}`);
			if (!res.ok) throw new Error('Failed to fetch memos');
			const data = await res.json();
			setMemos(data);
		} catch (error) {
			console.error('Error fetching memos:', error);
			toast.error('Failed to load memos');
		} finally {
			setLoading(false);
		}
	};

	const markAsRead = async (memoId: string) => {
		try {
			await fetch(`/api/memos/${memoId}`, {method: 'PATCH'});
			fetchMemos();
		} catch (error) {
			console.error('Error marking memo as read:', error);
		}
	};

	const handleMemoClick = (memo: Memo) => {
		setSelectedMemo(memo);
		if (!memo.isRead) {
			markAsRead(memo.memo.id);
		}
	};

	const deleteMemo = async (memoId: string) => {
		if (!confirm('Are you sure you want to delete this memo?')) return;

		try {
			const res = await fetch(`/api/memos/${memoId}`, {method: 'DELETE'});
			if (!res.ok) throw new Error('Failed to delete memo');
			toast.success('Memo deleted');
			setSelectedMemo(null);
			fetchMemos();
		} catch (error: any) {
			console.error('Error deleting memo:', error);
			toast.error(error.message || 'Failed to delete memo');
		}
	};

	const getPriorityBadge = (priority: string) => {
		const colors = {
			normal: 'bg-gray-100 text-gray-700',
			high: 'bg-yellow-100 text-yellow-700',
			urgent: 'bg-red-100 text-red-700',
		};
		return colors[priority as keyof typeof colors] || colors.normal;
	};

	const getRecipientTypeLabel = (type: string, targetLocations: string[]) => {
		switch (type) {
			case 'all-staff':
				return 'All Staff';
			case 'all-supervisors':
				return 'All Supervisors';
			case 'all-employees':
				return 'All Employees';
			case 'location':
				return `Location: ${targetLocations.join(', ')}`;
			case 'selected-locations':
				return `Locations: ${targetLocations.join(', ')}`;
			default:
				return type;
		}
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-bold text-gray-900">Memos</h2>
					<p className="text-sm text-gray-600">
						Communicate with your team
					</p>
				</div>
				<button
					onClick={() => setShowCreateModal(true)}
					className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
					✉️ New Memo
				</button>
			</div>

			{/* Filters */}
			<div className="flex gap-2">
				<button
					onClick={() => setFilter('all')}
					className={`px-4 py-2 rounded-md ${
						filter === 'all'
							? 'bg-blue-600 text-white'
							: 'bg-gray-100 text-gray-700 hover:bg-gray-200'
					}`}>
					All
				</button>
				<button
					onClick={() => setFilter('unread')}
					className={`px-4 py-2 rounded-md ${
						filter === 'unread'
							? 'bg-blue-600 text-white'
							: 'bg-gray-100 text-gray-700 hover:bg-gray-200'
					}`}>
					Unread ({memos.filter((m) => !m.isRead).length})
				</button>
			</div>

			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Memo List */}
				<div className="lg:col-span-1 bg-white rounded-lg shadow overflow-hidden">
					<div className="max-h-[600px] overflow-y-auto">
						{loading ? (
							<div className="p-8 text-center">
								<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
							</div>
						) : memos.length === 0 ? (
							<div className="p-8 text-center text-gray-500">
								No memos found
							</div>
						) : (
							memos.map((memoItem) => (
								<div
									key={memoItem.memo.id}
									onClick={() => handleMemoClick(memoItem)}
									className={`p-4 border-b cursor-pointer hover:bg-gray-50 ${
										selectedMemo?.memo.id === memoItem.memo.id
											? 'bg-blue-50'
											: ''
									} ${!memoItem.isRead ? 'bg-blue-50/30' : ''}`}>
									<div className="flex items-start justify-between mb-2">
										<h3
											className={`font-semibold ${
												!memoItem.isRead ? 'text-blue-900' : 'text-gray-900'
											}`}>
											{memoItem.memo.title}
										</h3>
										<span
											className={`text-xs px-2 py-1 rounded ${getPriorityBadge(
												memoItem.memo.priority
											)}`}>
											{memoItem.memo.priority}
										</span>
									</div>
									<p className="text-sm text-gray-600 mb-2">
										From: {memoItem.memo.senderName}
									</p>
									<p className="text-xs text-gray-500">
										{format(
											new Date(memoItem.memo.createdAt),
											'MMM d, yyyy h:mm a'
										)}
									</p>
								</div>
							))
						)}
					</div>
				</div>

				{/* Memo Detail */}
				<div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
					{selectedMemo ? (
						<div>
							<div className="flex items-start justify-between mb-4">
								<div className="flex-1">
									<h2 className="text-2xl font-bold text-gray-900 mb-2">
										{selectedMemo.memo.title}
									</h2>
									<div className="flex items-center gap-4 text-sm text-gray-600">
										<span>From: {selectedMemo.memo.senderName}</span>
										<span>•</span>
										<span>
											To:{' '}
											{getRecipientTypeLabel(
												selectedMemo.memo.recipientType,
												selectedMemo.memo.targetLocations
											)}
										</span>
										<span>•</span>
										<span>
											{format(
												new Date(selectedMemo.memo.createdAt),
												'MMM d, yyyy h:mm a'
											)}
										</span>
									</div>
								</div>
								{(userRole?.clerkUserId === selectedMemo.memo.senderClerkUserId ||
									userRole?.role === 'admin') && (
									<button
										onClick={() => deleteMemo(selectedMemo.memo.id)}
										className="text-red-600 hover:text-red-700">
										🗑️ Delete
									</button>
								)}
							</div>

							<div className="border-t pt-4">
								<div className="prose max-w-none">
									<p className="whitespace-pre-wrap">{selectedMemo.memo.content}</p>
								</div>
							</div>

							{selectedMemo.memo.expiresAt && (
								<div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-sm">
									⏰ Expires:{' '}
									{format(new Date(selectedMemo.memo.expiresAt), 'MMM d, yyyy')}
								</div>
							)}
						</div>
					) : (
						<div className="h-full flex items-center justify-center text-gray-500">
							Select a memo to view details
						</div>
					)}
				</div>
			</div>

			{/* Create Memo Modal */}
			{showCreateModal && (
				<CreateMemoModal
					userRole={userRole}
					locations={locations}
					onClose={() => setShowCreateModal(false)}
					onSuccess={() => {
						setShowCreateModal(false);
						fetchMemos();
					}}
				/>
			)}
		</div>
	);
}

function CreateMemoModal({
	userRole,
	locations,
	onClose,
	onSuccess,
}: {
	userRole: any;
	locations: string[];
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [form, setForm] = useState({
		title: '',
		content: '',
		recipientType: 'all-staff' as
			| 'location'
			| 'all-staff'
			| 'all-supervisors'
			| 'all-employees'
			| 'selected-locations',
		targetLocations: [] as string[],
		priority: 'normal' as 'normal' | 'high' | 'urgent',
		expiresAt: '',
	});
	const [submitting, setSubmitting] = useState(false);
	const [allLocations, setAllLocations] = useState<string[]>([]);

	useEffect(() => {
		// Fetch all locations for admin
		if (userRole?.role === 'admin') {
			fetchAllLocations();
		}
	}, [userRole]);

	const fetchAllLocations = async () => {
		try {
			const res = await fetch('/api/admin/locations');
			if (res.ok) {
				const data = await res.json();
				// Extract location names from location objects
				const locationNames = data.map((loc: any) => loc.name);
				setAllLocations(locationNames);
			}
		} catch (error) {
			console.error('Error fetching locations:', error);
		}
	};



	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);

		try {
			const res = await fetch('/api/memos', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({
					...form,
					expiresAt: form.expiresAt || undefined,
				}),
			});

			if (!res.ok) {
				const error = await res.json();
				throw new Error(error.error || 'Failed to create memo');
			}

			toast.success('Memo sent successfully');
			onSuccess();
		} catch (error: any) {
			console.error('Error creating memo:', error);
			toast.error(error.message || 'Failed to send memo');
		} finally {
			setSubmitting(false);
		}
	};

	const recipientOptions = () => {
		if (userRole?.role === 'admin') {
			return [
				{value: 'all-employees', label: 'All Employees'},
				{value: 'all-staff', label: 'All Staff'},
				{value: 'all-supervisors', label: 'All Supervisors'},
				{value: 'selected-locations', label: 'Selected Locations'},
			];
		} else if (userRole?.role === 'supervisor') {
			return [
				{value: 'location', label: 'My Locations'},
				{value: 'selected-locations', label: 'Selected Locations'},
			];
		} else {
			return [{value: 'location', label: 'My Location'}];
		}
	};

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
			<div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
				<div className="p-6">
					<div className="flex items-center justify-between mb-4">
						<h2 className="text-2xl font-bold">New Memo</h2>
						<button
							onClick={onClose}
							className="text-gray-500 hover:text-gray-700">
							✕
						</button>
					</div>

					<form onSubmit={handleSubmit} className="space-y-4">
						<div>
							<label className="block text-sm font-medium mb-1">Title</label>
							<input
								type="text"
								value={form.title}
								onChange={(e) => setForm({...form, title: e.target.value})}
								className="w-full border rounded px-3 py-2"
								required
							/>
						</div>

						<div>
							<label className="block text-sm font-medium mb-1">Message</label>
							<textarea
								value={form.content}
								onChange={(e) => setForm({...form, content: e.target.value})}
								className="w-full border rounded px-3 py-2"
								rows={6}
								required
							/>
						</div>

						<div className="grid grid-cols-2 gap-4">
							<div>
								<label className="block text-sm font-medium mb-1">
									Send To
								</label>
								<select
									value={form.recipientType}
									onChange={(e) =>
										setForm({
											...form,
											recipientType: e.target.value as any,
											targetLocations: [],
										})
									}
									className="w-full border rounded px-3 py-2">
									{recipientOptions().map((opt) => (
										<option key={opt.value} value={opt.value}>
											{opt.label}
										</option>
									))}
								</select>
							</div>

							<div>
								<label className="block text-sm font-medium mb-1">
									Priority
								</label>
								<select
									value={form.priority}
									onChange={(e) =>
										setForm({...form, priority: e.target.value as any})
									}
									className="w-full border rounded px-3 py-2">
									<option value="normal">Normal</option>
									<option value="high">High</option>
									<option value="urgent">Urgent</option>
								</select>
							</div>
						</div>

						{form.recipientType === 'selected-locations' && (
							<div>
								<label className="block text-sm font-medium mb-1">
									Select Locations
								</label>
								<div className="border rounded p-3 max-h-40 overflow-y-auto space-y-2">
									{(userRole?.role === 'admin' ? allLocations : locations).map(
										(loc) => (
											<label
												key={loc}
												className="flex items-center space-x-2">
												<input
													type="checkbox"
													checked={form.targetLocations.includes(loc)}
													onChange={(e) => {
														if (e.target.checked) {
															setForm({
																...form,
																targetLocations: [
																	...form.targetLocations,
																	loc,
																],
															});
														} else {
															setForm({
																...form,
																targetLocations:
																	form.targetLocations.filter(
																		(l) => l !== loc
																	),
															});
														}
													}}
												/>
												<span>{loc}</span>
											</label>
										)
									)}
								</div>
							</div>
						)}

						<div>
							<label className="block text-sm font-medium mb-1">
								Expires On (Optional)
							</label>
							<input
								type="date"
								value={form.expiresAt}
								onChange={(e) => setForm({...form, expiresAt: e.target.value})}
								className="w-full border rounded px-3 py-2"
							/>
						</div>

						<div className="flex gap-3 pt-4">
							<button
								type="submit"
								disabled={submitting}
								className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
								{submitting ? 'Sending...' : 'Send Memo'}
							</button>
							<button
								type="button"
								onClick={onClose}
								className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
								Cancel
							</button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
