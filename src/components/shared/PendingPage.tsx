'use client';

import React, {useEffect, useState} from 'react';
import { SignOutButton } from '../auth/SignOutButton';

interface PendingPageProps {
	message?: string;
}

export default function PendingPage({message}: PendingPageProps = {}) {
	const [sessionInfo, setSessionInfo] = useState<any>(null);

	useEffect(() => {
		async function fetchSession() {
			try {
				const res = await fetch('/api/access/session');
				const data = await res.json();
				setSessionInfo(data);
			} catch (error) {
				console.error('Error fetching session:', error);
			}
		}

		fetchSession();
	}, []);

	return (
		<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
			<div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
				<div className="text-6xl mb-6">⏳</div>
				<h2 className="text-2xl font-bold text-gray-900 mb-4">
					Account Pending Setup
				</h2>
				<p className="text-gray-600 mb-6">
					{message ||
						'Your account is being configured by an administrator. Please check back later or contact your system administrator for assistance.'}
				</p>

				{sessionInfo?.user && (
					<div className="bg-gray-50 rounded-lg p-4 mb-6">
						<p className="text-sm text-gray-700">
							<strong>Account:</strong> {sessionInfo.user.name}
						</p>
						{sessionInfo.user.email && (
							<p className="text-sm text-gray-700 mt-1">
								<strong>Email:</strong> {sessionInfo.user.email}
							</p>
						)}
					</div>
				)}

				<div className="space-y-3">
					<button
						onClick={() => window.location.reload()}
						className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors font-medium">
						Check Again
					</button>
					<SignOutButton />
				</div>

				<p className="text-xs text-gray-500 mt-6">
					If you continue to see this message, please contact your
					administrator.
				</p>
			</div>
		</div>
	);
}
