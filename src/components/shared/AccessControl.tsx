'use client';

import React, {useEffect, useState} from 'react';
import {useAuth} from '@clerk/nextjs';

interface AccessControlProps {
	children: React.ReactNode;
	route: string;
}

export default function AccessControl({children, route}: AccessControlProps) {
	const {userId} = useAuth();
	const [isChecking, setIsChecking] = useState(true);
	const [accessCheck, setAccessCheck] = useState<any>(null);

	useEffect(() => {
		async function checkAccess() {
			if (!userId) {
				window.location.href = '/';
				return;
			}

			try {
				const res = await fetch(
					`/api/access/check?route=${encodeURIComponent(route)}`
				);
				const data = await res.json();
				setAccessCheck(data);
				setIsChecking(false);

				if (!data.granted && data.redirectTo) {
					// Log the access denial
					await fetch('/api/access/log', {
						method: 'POST',
						headers: {'Content-Type': 'application/json'},
						body: JSON.stringify({
							activity: 'access_redirect',
							details: `from=${route},to=${data.redirectTo},reason=${data.reason}`,
						}),
					});

					// Redirect to appropriate page
					window.location.href = data.redirectTo;
				}
			} catch (error) {
				console.error('Error checking access:', error);
				setIsChecking(false);
			}
		}

		checkAccess();
	}, [route, userId]);

	if (isChecking || !accessCheck) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Verifying access...</p>
				</div>
			</div>
		);
	}

	if (!accessCheck.granted) {
		return (
			<div className="min-h-screen flex items-center justify-center bg-gray-50">
				<div className="max-w-md w-full bg-white p-8 rounded-lg shadow-md text-center">
					<div className="text-6xl mb-4">🚫</div>
					<h2 className="text-2xl font-bold text-gray-900 mb-4">
						Access Denied
					</h2>
					<p className="text-gray-600 mb-6">
						You don&apos;t have permission to access this page.
					</p>
					<button
						onClick={() =>
							(window.location.href = accessCheck.redirectTo || '/')
						}
						className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 transition-colors">
						Go to Dashboard
					</button>
				</div>
			</div>
		);
	}

	return <>{children}</>;
}
