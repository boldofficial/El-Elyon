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
