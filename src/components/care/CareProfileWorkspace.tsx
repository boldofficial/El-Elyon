'use client';

import React, {useState, useEffect} from 'react';
import {toast} from 'sonner';

export default function CareProfileWorkspace() {
	const [sessionInfo, setSessionInfo] = useState<any>(null);
	const [pendingAcknowledgments, setPendingAcknowledgments] = useState<any[]>(
		[]
	);
	const [processingAck, setProcessingAck] = useState<string | null>(null);

	useEffect(() => {
		async function fetchData() {
			try {
				const sessionRes = await fetch('/api/access/session');
				const session = await sessionRes.json();
				setSessionInfo(session);

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

			// Refresh acknowledgments
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

	return (
		<div className="space-y-6">
			<div className="text-center">
				<h2 className="text-2xl font-bold text-gray-900 mb-2">My Profile</h2>
				<p className="text-gray-600">
					Credentials and required acknowledgments
				</p>
			</div>

			<div className="bg-white rounded-lg shadow-sm border p-6">
				<h3 className="text-lg font-semibold mb-4">User Information</h3>

				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<div>
						<label className="block text-sm font-medium text-gray-700">
							Name
						</label>
						<p className="text-gray-900">
							{sessionInfo?.user?.name || 'Not provided'}
						</p>
					</div>

					<div>
						<label className="block text-sm font-medium text-gray-700">
							Email
						</label>
						<p className="text-gray-900">
							{sessionInfo?.user?.email || 'Not provided'}
						</p>
					</div>

					<div>
						<label className="block text-sm font-medium text-gray-700">
							Role
						</label>
						<p className="text-gray-900 capitalize">
							{sessionInfo?.role || 'Not assigned'}
						</p>
					</div>

					<div>
						<label className="block text-sm font-medium text-gray-700">
							Assigned Locations
						</label>
						<p className="text-gray-900">
							{sessionInfo?.locations?.length
								? sessionInfo.locations.join(', ')
								: 'No locations assigned'}
						</p>
					</div>
				</div>
			</div>

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
