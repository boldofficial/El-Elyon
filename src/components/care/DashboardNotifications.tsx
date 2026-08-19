'use client';

// src/components/care/DashboardNotifications.tsx
//
// Notification area shown on the shift dashboard, directly under the Clock In
// card. Surfaces items the user must see: pending ISP acknowledgments (which
// require an explicit "Acknowledge" action) and unread memos.

import React, {useCallback, useEffect, useState} from 'react';
import {toast} from 'sonner';

interface PendingIspAck {
	ispFileId: string;
	residentId: string;
	residentName: string;
	location: string | null;
	versionLabel: string;
	effectiveDate: string;
	fileName: string;
}

interface Memo {
	id: string;
	title: string;
	content: string;
	senderName: string;
	priority?: string | null;
	createdAt: string;
}

const PRIORITY_STYLES: Record<string, string> = {
	urgent: 'bg-red-100 text-red-800 border-red-200',
	high: 'bg-orange-100 text-orange-800 border-orange-200',
	normal: 'bg-blue-100 text-blue-800 border-blue-200',
};

export default function DashboardNotifications() {
	const [pendingIspAcks, setPendingIspAcks] = useState<PendingIspAck[]>([]);
	const [unreadMemos, setUnreadMemos] = useState<Memo[]>([]);
	const [loading, setLoading] = useState(true);
	const [acking, setAcking] = useState<string | null>(null);

	const fetchNotifications = useCallback(async () => {
		try {
			const res = await fetch('/api/care/dashboard-notifications');
			if (!res.ok) throw new Error('Failed to load notifications');
			const data = await res.json();
			setPendingIspAcks(data.pendingIspAcks || []);
			setUnreadMemos(data.unreadMemos || []);
		} catch (error) {
			console.error('Error loading dashboard notifications:', error);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchNotifications();
	}, [fetchNotifications]);

	const handleAcknowledge = async (ispFileId: string) => {
		setAcking(ispFileId);
		try {
			const res = await fetch('/api/care/isp-files/acknowledge', {
				method: 'POST',
				headers: {'Content-Type': 'application/json'},
				body: JSON.stringify({ispFileId}),
			});
			if (!res.ok) throw new Error('Failed to acknowledge');
			toast.success('ISP acknowledged');
			setPendingIspAcks((prev) =>
				prev.filter((a) => a.ispFileId !== ispFileId)
			);
		} catch (error) {
			console.error('Error acknowledging ISP:', error);
			toast.error('Failed to acknowledge ISP');
		} finally {
			setAcking(null);
		}
	};

	const handleMarkMemoRead = async (memoId: string) => {
		try {
			const res = await fetch(`/api/memos/${memoId}`, {method: 'PATCH'});
			if (!res.ok) throw new Error('Failed to mark read');
			setUnreadMemos((prev) => prev.filter((m) => m.id !== memoId));
		} catch (error) {
			console.error('Error marking memo read:', error);
			toast.error('Failed to mark memo as read');
		}
	};

	// Render nothing until we know there's something to show.
	if (loading) return null;
	if (pendingIspAcks.length === 0 && unreadMemos.length === 0) return null;

	return (
		<div className="space-y-4">
			{/* Pending ISP acknowledgments */}
			{pendingIspAcks.length > 0 && (
				<div className="bg-white rounded-lg shadow-sm border border-amber-200">
					<div className="px-4 py-3 border-b border-amber-100 bg-amber-50 rounded-t-lg flex items-center gap-2">
						<span className="text-lg">📋</span>
						<h3 className="font-semibold text-amber-900">
							ISPs awaiting your acknowledgment
						</h3>
						<span className="ml-auto text-xs font-medium bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">
							{pendingIspAcks.length}
						</span>
					</div>
					<ul className="divide-y">
						{pendingIspAcks.map((ack) => (
							<li
								key={ack.ispFileId}
								className="px-4 py-3 flex items-center justify-between gap-4">
								<div className="min-w-0">
									<p className="text-sm font-medium text-gray-900 truncate">
										{ack.residentName}
										<span className="text-gray-400 font-normal">
											{' '}
											· {ack.versionLabel}
										</span>
									</p>
									<p className="text-xs text-gray-500">
										Effective{' '}
										{new Date(ack.effectiveDate).toLocaleDateString()}
										{ack.location ? ` · ${ack.location}` : ''}
									</p>
								</div>
								<button
									type="button"
									onClick={() => handleAcknowledge(ack.ispFileId)}
									disabled={acking === ack.ispFileId}
									className="flex-shrink-0 px-3 py-1.5 text-sm font-medium bg-amber-600 text-white rounded hover:bg-amber-700 disabled:opacity-50">
									{acking === ack.ispFileId
										? 'Saving...'
										: 'I have read this'}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}

			{/* Unread memos */}
			{unreadMemos.length > 0 && (
				<div className="bg-white rounded-lg shadow-sm border">
					<div className="px-4 py-3 border-b bg-gray-50 rounded-t-lg flex items-center gap-2">
						<span className="text-lg">📣</span>
						<h3 className="font-semibold text-gray-900">Memos</h3>
						<span className="ml-auto text-xs font-medium bg-gray-200 text-gray-800 px-2 py-0.5 rounded-full">
							{unreadMemos.length}
						</span>
					</div>
					<ul className="divide-y">
						{unreadMemos.map((memo) => (
							<li key={memo.id} className="px-4 py-3">
								<div className="flex items-start justify-between gap-3">
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<p className="text-sm font-semibold text-gray-900 truncate">
												{memo.title}
											</p>
											{memo.priority && memo.priority !== 'normal' && (
												<span
													className={`text-[10px] uppercase font-medium px-1.5 py-0.5 rounded border ${
														PRIORITY_STYLES[memo.priority] ||
														PRIORITY_STYLES.normal
													}`}>
													{memo.priority}
												</span>
											)}
										</div>
										<p className="text-sm text-gray-700 mt-1 whitespace-pre-wrap line-clamp-3">
											{memo.content}
										</p>
										<p className="text-xs text-gray-400 mt-1">
											{memo.senderName} ·{' '}
											{new Date(memo.createdAt).toLocaleDateString()}
										</p>
									</div>
									<button
										type="button"
										onClick={() => handleMarkMemoRead(memo.id)}
										className="flex-shrink-0 text-xs font-medium text-blue-600 hover:text-blue-800">
										Mark read
									</button>
								</div>
							</li>
						))}
					</ul>
				</div>
			)}
		</div>
	);
}
