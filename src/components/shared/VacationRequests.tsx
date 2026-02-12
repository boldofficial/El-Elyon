// src/components/shared/VacationRequests.tsx
'use client';

import {useState, useEffect} from 'react';
import {toast} from 'sonner';

interface VacationRequest {
	id: string;
	employeeClerkUserId: string;
	employeeName: string;
	startDate: string;
	endDate: string;
	reason: string;
	status: 'pending' | 'approved' | 'denied';
	adminComments?: string;
	adminName?: string;
	respondedAt?: string;
	createdAt: string;
}

interface VacationRequestsProps {
	isAdmin?: boolean;
}

export default function VacationRequests({isAdmin = false}: VacationRequestsProps) {
	const [requests, setRequests] = useState<VacationRequest[]>([]);
	const [loading, setLoading] = useState(true);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'approved' | 'denied'>('all');

	useEffect(() => {
		fetchRequests();
	}, [filterStatus]);

	const fetchRequests = async () => {
		setLoading(true);
		try {
			const url =
				filterStatus === 'all'
					? '/api/vacation-requests'
					: `/api/vacation-requests?status=${filterStatus}`;
			const res = await fetch(url);
			if (res.ok) {
				const data = await res.json();
				setRequests(data);
			}
		} catch (error) {
			console.error('Error fetching vacation requests:', error);
			toast.error('Failed to load vacation requests');
		} finally {
			setLoading(false);
		}
	};

	const getStatusBadge = (status: string) => {
		const styles = {
			pending: 'bg-yellow-100 text-yellow-800',
			approved: 'bg-green-100 text-green-800',
			denied: 'bg-red-100 text-red-800',
		};
		return (
			<span
				className={`px-2 py-1 rounded text-xs font-semibold ${
					styles[status as keyof typeof styles]
				}`}>
				{status.toUpperCase()}
			</span>
		);
	};

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	};

	const calculateDays = (start: string, end: string) => {
		const startDate = new Date(start);
		const endDate = new Date(end);
		const days = Math.ceil(
			(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
		);
		return days + 1; // Include both start and end days
	};

	return (
		<div className="space-y-6">
			{/* Header */}
			<div className="flex justify-between items-center">
				<div>
					<h2 className="text-2xl font-bold">
						{isAdmin ? 'Vacation Requests' : 'My Vacation Requests'}
					</h2>
					<p className="text-gray-600">
						{isAdmin
							? 'Review and manage employee vacation requests'
							: 'Submit and track your vacation requests'}
					</p>
				</div>
				{!isAdmin && (
					<button
						onClick={() => setShowCreateModal(true)}
						className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
						Request Vacation
					</button>
				)}
			</div>

			{/* Filters */}
			<div className="flex gap-2">
				{['all', 'pending', 'approved', 'denied'].map((status) => (
					<button
						key={status}
						onClick={() => setFilterStatus(status as any)}
						className={`px-4 py-2 rounded-lg ${
							filterStatus === status
								? 'bg-blue-600 text-white'
								: 'bg-gray-200 text-gray-700 hover:bg-gray-300'
						}`}>
						{status.charAt(0).toUpperCase() + status.slice(1)}
					</button>
				))}
			</div>

			{/* Requests List */}
			{loading ? (
				<div className="text-center py-12">Loading...</div>
			) : requests.length === 0 ? (
				<div className="text-center py-12 text-gray-500">
					No vacation requests found
				</div>
			) : (
				<div className="space-y-4">
					{requests.map((request) => (
						<RequestCard
							key={request.id}
							request={request}
							isAdmin={isAdmin}
							onUpdate={fetchRequests}
						/>
					))}
				</div>
			)}

			{/* Create Modal */}
			{showCreateModal && (
				<CreateRequestModal
					onClose={() => setShowCreateModal(false)}
					onSuccess={() => {
						setShowCreateModal(false);
						fetchRequests();
					}}
				/>
			)}
		</div>
	);
}

// Request Card Component
function RequestCard({
	request,
	isAdmin,
	onUpdate,
}: {
	request: VacationRequest;
	isAdmin: boolean;
	onUpdate: () => void;
}) {
	const [showResponseModal, setShowResponseModal] = useState(false);

	const formatDate = (dateString: string) => {
		return new Date(dateString).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
		});
	};

	const calculateDays = (start: string, end: string) => {
		const startDate = new Date(start);
		const endDate = new Date(end);
		const days = Math.ceil(
			(endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
		);
		return days + 1;
	};

	const getStatusBadge = (status: string) => {
		const styles = {
			pending: 'bg-yellow-100 text-yellow-800',
			approved: 'bg-green-100 text-green-800',
			denied: 'bg-red-100 text-red-800',
		};
		return (
			<span
				className={`px-2 py-1 rounded text-xs font-semibold ${
					styles[status as keyof typeof styles]
				}`}>
				{status.toUpperCase()}
			</span>
		);
	};

	return (
		<div className="border rounded-lg p-4 bg-white shadow-sm hover:shadow-md transition-shadow">
			<div className="flex justify-between items-start mb-3">
				<div>
					{isAdmin && (
						<h3 className="font-semibold text-lg">{request.employeeName}</h3>
					)}
					<p className="text-sm text-gray-600">
						{formatDate(request.startDate)} - {formatDate(request.endDate)}
						<span className="ml-2 text-blue-600 font-medium">
							({calculateDays(request.startDate, request.endDate)} days)
						</span>
					</p>
				</div>
				{getStatusBadge(request.status)}
			</div>

			{request.reason && (
				<div className="mb-3">
					<p className="text-sm font-medium text-gray-700">Reason:</p>
					<p className="text-sm text-gray-600">{request.reason}</p>
				</div>
			)}

			{request.status !== 'pending' && request.adminComments && (
				<div className="mb-3 bg-gray-50 p-3 rounded">
					<p className="text-sm font-medium text-gray-700">Admin Response:</p>
					<p className="text-sm text-gray-600">{request.adminComments}</p>
					<p className="text-xs text-gray-500 mt-1">
						by {request.adminName} on {formatDate(request.respondedAt!)}
					</p>
				</div>
			)}

			<div className="flex justify-between items-center text-xs text-gray-500">
				<span>Submitted {formatDate(request.createdAt)}</span>
				{isAdmin && request.status === 'pending' && (
					<button
						onClick={() => setShowResponseModal(true)}
						className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
						Respond
					</button>
				)}
			</div>

			{showResponseModal && (
				<ResponseModal
					request={request}
					onClose={() => setShowResponseModal(false)}
					onSuccess={() => {
						setShowResponseModal(false);
						onUpdate();
					}}
				/>
			)}
		</div>
	);
}

// Create Request Modal
function CreateRequestModal({
	onClose,
	onSuccess,
}: {
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [form, setForm] = useState({
		startDate: '',
		endDate: '',
		reason: '',
	});
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);

		try {
			const res = await fetch('/api/vacation-requests', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify(form),
			});

			if (!res.ok) {
				const error = await res.json();
				throw new Error(error.error || 'Failed to create request');
			}

			toast.success('Vacation request submitted successfully');
			onSuccess();
		} catch (error: any) {
			console.error('Error creating request:', error);
			toast.error(error.message || 'Failed to submit request');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
				<h3 className="text-xl font-bold mb-4">Request Vacation</h3>
				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium mb-1">Start Date</label>
						<input
							type="date"
							required
							value={form.startDate}
							onChange={(e) => setForm({...form, startDate: e.target.value})}
							className="w-full border rounded px-3 py-2"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium mb-1">End Date</label>
						<input
							type="date"
							required
							value={form.endDate}
							onChange={(e) => setForm({...form, endDate: e.target.value})}
							className="w-full border rounded px-3 py-2"
						/>
					</div>

					<div>
						<label className="block text-sm font-medium mb-1">
							Reason (Optional)
						</label>
						<textarea
							value={form.reason}
							onChange={(e) => setForm({...form, reason: e.target.value})}
							rows={3}
							className="w-full border rounded px-3 py-2"
							placeholder="Briefly describe the reason for your vacation..."
						/>
					</div>

					<div className="flex gap-3 pt-4">
						<button
							type="submit"
							disabled={submitting}
							className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
							{submitting ? 'Submitting...' : 'Submit Request'}
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
	);
}

// Response Modal (Admin)
function ResponseModal({
	request,
	onClose,
	onSuccess,
}: {
	request: VacationRequest;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [status, setStatus] = useState<'approved' | 'denied'>('approved');
	const [adminComments, setAdminComments] = useState('');
	const [submitting, setSubmitting] = useState(false);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);

		try {
			const res = await fetch(`/api/vacation-requests/${request.id}`, {
				method: 'PATCH',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({status, adminComments}),
			});

			if (!res.ok) {
				const error = await res.json();
				throw new Error(error.error || 'Failed to update request');
			}

			toast.success(`Vacation request ${status}`);
			onSuccess();
		} catch (error: any) {
			console.error('Error updating request:', error);
			toast.error(error.message || 'Failed to update request');
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
			<div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
				<h3 className="text-xl font-bold mb-4">Respond to Vacation Request</h3>
				<div className="mb-4 p-3 bg-gray-50 rounded">
					<p className="font-medium">{request.employeeName}</p>
					<p className="text-sm text-gray-600">
						{new Date(request.startDate).toLocaleDateString()} -{' '}
						{new Date(request.endDate).toLocaleDateString()}
					</p>
				</div>

				<form onSubmit={handleSubmit} className="space-y-4">
					<div>
						<label className="block text-sm font-medium mb-2">Decision</label>
						<div className="flex gap-4">
							<label className="flex items-center">
								<input
									type="radio"
									value="approved"
									checked={status === 'approved'}
									onChange={(e) => setStatus(e.target.value as 'approved')}
									className="mr-2"
								/>
								Approve
							</label>
							<label className="flex items-center">
								<input
									type="radio"
									value="denied"
									checked={status === 'denied'}
									onChange={(e) => setStatus(e.target.value as 'denied')}
									className="mr-2"
								/>
								Deny
							</label>
						</div>
					</div>

					<div>
						<label className="block text-sm font-medium mb-1">
							Comments (Optional)
						</label>
						<textarea
							value={adminComments}
							onChange={(e) => setAdminComments(e.target.value)}
							rows={3}
							className="w-full border rounded px-3 py-2"
							placeholder="Add any comments for the employee..."
						/>
					</div>

					<div className="flex gap-3 pt-4">
						<button
							type="submit"
							disabled={submitting}
							className={`flex-1 px-4 py-2 text-white rounded disabled:opacity-50 ${
								status === 'approved'
									? 'bg-green-600 hover:bg-green-700'
									: 'bg-red-600 hover:bg-red-700'
							}`}>
							{submitting ? 'Submitting...' : `${status === 'approved' ? 'Approve' : 'Deny'} Request`}
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
	);
}
