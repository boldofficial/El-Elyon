'use client';

import {useEffect, useState} from 'react';
import {Toaster} from 'sonner';
import GuardianChecklistPublic from '@/components/guardian/GuardianChecklistPublic';

export default function GuardianChecklistPage() {
	const [token, setToken] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		if (typeof window !== 'undefined') {
			const params = new URLSearchParams(window.location.search);
			setToken(params.get('token'));
			setLoading(false);
		}
	}, []);

	if (loading) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="text-4xl mb-4">📋</div>
					<p className="text-gray-600">Loading checklist...</p>
				</div>
			</div>
		);
	}

	if (!token) {
		return (
			<div className="flex items-center justify-center min-h-screen bg-gray-50">
				<div className="max-w-md w-full bg-white p-8 rounded-lg shadow-lg text-center">
					<div className="text-6xl mb-4">❌</div>
					<h2 className="text-2xl font-bold text-gray-900 mb-4">
						Invalid Link
					</h2>
					<p className="text-gray-600">
						This guardian checklist link is missing a valid token. Please use the link provided in your email.
					</p>
				</div>
			</div>
		);
	}

	return (
		<>
			<Toaster />
			<GuardianChecklistPublic token={token} />
		</>
	);
}
