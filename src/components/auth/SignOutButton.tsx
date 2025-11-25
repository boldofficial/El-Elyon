'use client';

import {useClerk, useUser} from '@clerk/nextjs';
import {toast} from 'sonner';
import {useState, useEffect} from 'react';

export function SignOutButton() {
	const {signOut} = useClerk();
	const {user} = useUser();
	const [currentShift, setCurrentShift] = useState<any>(null);

	// Check for active shift
	useEffect(() => {
		async function checkShift() {
			if (!user?.id) return;

			try {
				const res = await fetch('/api/shifts/current');
				if (res.ok) {
					const shift = await res.json();
					setCurrentShift(shift);
				}
			} catch (error) {
				console.error('Error checking shift:', error);
			}
		}

		checkShift();
	}, [user?.id]);

	const handleSignOut = async () => {
		// Check if user has an active shift
		if (currentShift) {
			const confirmed = window.confirm(
				'You are currently clocked in. Signing out will automatically clock you out. Do you want to continue?'
			);
			if (!confirmed) return;

			try {
				const res = await fetch('/api/shifts/clock-out', {
					method: 'POST',
				});

				if (!res.ok) {
					throw new Error('Failed to clock out');
				}

				toast.success('Clocked out successfully');
			} catch (error: any) {
				toast.error(
					'Failed to clock out: ' + (error.message || 'Unknown error')
				);
				return;
			}
		}

		// Sign out from Clerk
		await signOut();
	};

	return (
		<button
			className="px-4 py-2 rounded bg-white text-gray-700 border border-gray-200 font-semibold hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm hover:shadow"
			onClick={handleSignOut}>
			Sign out
		</button>
	);
}
