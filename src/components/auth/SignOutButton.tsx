'use client';

import {useClerk, useUser} from '@clerk/nextjs';
import {toast} from 'sonner';
import {useState} from 'react';

export function SignOutButton() {
	const {signOut} = useClerk();
	const {user} = useUser();
	const [isSigningOut, setIsSigningOut] = useState(false);

	const handleSignOut = async () => {
		if (isSigningOut) return;
		setIsSigningOut(true);

		try {
			// Check for active shift (fresh check)
			let hasActiveShift = false;
			try {
				const res = await fetch('/api/shifts/current');
				if (res.ok) {
					const shift = await res.json();
					hasActiveShift = !!shift;
				}
			} catch (error) {
				console.error('Error checking shift:', error);
			}

			// If user has active shift, they must clock out first
			if (hasActiveShift) {
				const confirmed = window.confirm(
					'You are currently clocked in. Signing out will automatically clock you out. Do you want to continue?'
				);
				if (!confirmed) {
					setIsSigningOut(false);
					return;
				}

				// Clock out - must succeed before sign out
				try {
					const res = await fetch('/api/shifts/clock-out', {
						method: 'POST',
					});

					if (!res.ok) {
						throw new Error('Clock out failed');
					}

					toast.success('Clocked out successfully');
				} catch (error) {
					console.error('Error clocking out:', error);
					toast.error('Failed to clock out. Please try again or clock out manually first.');
					setIsSigningOut(false);
					return; // Don't continue to sign out
				}
			}

			// Sign out from Clerk
			await signOut({redirectUrl: '/'});
		} catch (error) {
			console.error('Error during sign out:', error);
			toast.error('Failed to sign out. Please try again.');
			setIsSigningOut(false);
		}
	};

	return (
		<button
			className="px-4 py-2 rounded bg-white text-gray-700 border border-gray-200 font-semibold hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-sm hover:shadow disabled:opacity-50"
			onClick={handleSignOut}
			disabled={isSigningOut}>
			{isSigningOut ? 'Signing out...' : 'Sign out'}
		</button>
	);
}
