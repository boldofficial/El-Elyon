'use client';

import React, {useState, useEffect} from 'react';
import {useUser} from '@clerk/nextjs';
import {toast} from 'sonner';
import {useRouter} from 'next/navigation';

export default function BootstrapAdmin() {
	const {isLoaded, isSignedIn, user} = useUser();
	const router = useRouter();
	const [hasAdmin, setHasAdmin] = useState<boolean | undefined>(undefined);
	const [isSubmitting, setIsSubmitting] = useState(false);

	useEffect(() => {
		async function checkAdminStatus() {
			try {
				const res = await fetch('/api/admin/has-admin');
				const data = await res.json();
				setHasAdmin(data.hasAdmin);
			} catch (error) {
				console.error('Error checking admin status:', error);
				toast.error('Failed to check admin status.');
				setHasAdmin(true); // Assume admin exists to prevent bootstrap issues
			}
		}
		checkAdminStatus();
	}, []);

	const handleBootstrap = async () => {
		if (!user?.id) {
			toast.error('You must be signed in to become the first admin.');
			return;
		}

		setIsSubmitting(true);
		try {
			const res = await fetch('/api/admin/create-first', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
			});

			if (!res.ok) {
				const errorData = await res.json();
				throw new Error(errorData.error || 'Failed to create admin account.');
			}

			toast.success('Admin account created successfully! Redirecting...');
			setTimeout(() => {
				router.push('/admin'); // Redirect to admin portal after bootstrap
			}, 1500);
		} catch (error: any) {
			console.error('Bootstrap error:', error);
			toast.error(error.message || 'An error occurred during bootstrap.');
			setIsSubmitting(false);
		}
	};

	if (!isLoaded || hasAdmin === undefined) {
		return (
			<div className="w-full min-h-screen bg-[rgb(248_250_252)] dark:bg-neutral-950 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
					<p className="mt-4 text-gray-600 dark:text-gray-400">
						Checking system status...
					</p>
				</div>
			</div>
		);
	}

	if (hasAdmin) {
		// If admin already exists, redirect to sign-in or home
		router.push('/sign-in');
		return null;
	}

	if (!isSignedIn) {
		// If no admin exists but user is not signed in, prompt to sign in
		return (
			<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
				<div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8 text-center">
					<h1 className="text-2xl font-bold text-gray-900 mb-4">
						First Admin Setup
					</h1>
					<p className="text-gray-600 mb-6">
						No administrator account exists yet. Please sign in or sign up with
						Clerk to become the first administrator.
					</p>
					<button
						onClick={() => router.push('/sign-in')}
						className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 transition-colors"
					>
						Sign In / Sign Up
					</button>
				</div>
			</div>
		);
	}

	// If no admin exists and user is signed in, show bootstrap button
	return (
		<div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
			<div className="bg-white rounded-lg shadow-xl max-w-md w-full p-8">
				<div className="text-center mb-8">
					<div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 rounded-full mb-4">
						<svg
							className="w-8 h-8 text-blue-600"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
							/>
						</svg>
					</div>
					<h1 className="text-2xl font-bold text-gray-900 mb-2">
						Become the First Administrator
					</h1>
					<p className="text-gray-600">
						You are currently signed in as{' '}
						<span className="font-semibold">
							{user?.fullName || user?.primaryEmailAddress?.emailAddress}
						</span>
						. Click below to set up this account as the first administrator.
					</p>
				</div>

				<button
					onClick={handleBootstrap}
					disabled={isSubmitting}
					className="w-full bg-blue-600 text-white py-3 rounded-md font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? 'Setting Up Admin...' : 'Set Up Admin Account'}
				</button>

				<div className="mt-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
					<div className="flex gap-3">
						<svg
							className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5"
							fill="none"
							stroke="currentColor"
							viewBox="0 0 24 24"
						>
							<path
								strokeLinecap="round"
								strokeLinejoin="round"
								strokeWidth={2}
								d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
							/>
						</svg>
						<div>
							<p className="text-sm font-medium text-amber-800 dark:text-amber-200 mb-1">
								Security Notice
							</p>
							<p className="text-xs text-amber-700 dark:text-amber-300">
								This action will make your current signed-in account the first
								administrator. This process can only be done once.
							</p>
						</div>
					</div>
				</div>

				<div className="pt-6 text-center text-xs text-gray-500">
					Powered by{' '}
					<span className="font-medium">Bold Ideas Innovations Ltd.</span>
				</div>
			</div>
		</div>
	);
}
