'use client';

import {useUser} from '@clerk/nextjs';
import {useEffect, useState, useRef} from 'react';
import {Toaster} from 'sonner';
import KioskSession from '@/components/kiosk/KioskSession';
import {SignInForm} from '@/components/auth/SignInForm';

export default function KioskPage() {
	const {isLoaded, isSignedIn} = useUser();

	// Wait for Clerk to load
	if (!isLoaded) {
		return (
			<div className="flex items-center justify-center min-h-screen">
				<div className="text-center">
					<div className="text-4xl mb-4">🔐</div>
					<p className="text-gray-600">Initializing...</p>
				</div>
			</div>
		);
	}

	// Show sign-in form if not authenticated
	if (!isSignedIn) {
		return (
			<>
				<Toaster />
				<SignInForm />
			</>
		);
	}

	return (
		<>
			<Toaster />
			<KioskSession />
		</>
	);
}
