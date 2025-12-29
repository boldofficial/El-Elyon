'use client';

import {SignIn, SignUp} from '@clerk/nextjs';
import {useEffect, useState} from 'react';

// Shared appearance configuration for purple Canva-style theme
const clerkAppearance = {
	variables: {
		colorPrimary: '#7c3aed', // Purple
		colorBackground: '#ffffff',
		colorText: '#1f2937',
		colorTextSecondary: '#6b7280',
		colorInputBackground: '#ffffff',
		colorInputText: '#1f2937',
		borderRadius: '0.75rem',
		fontFamily: 'inherit',
	},
	elements: {
		// Root container
		rootBox: 'mx-auto w-full flex items-center justify-center flex-col',
		card: 'shadow-none border-0 bg-transparent',
		
		// Header
		headerTitle: 'text-2xl font-bold text-gray-900',
		headerSubtitle: 'text-gray-600',
		
		// Social buttons
		socialButtonsBlockButton: 'border border-gray-300 hover:bg-gray-50 transition-colors',
		socialButtonsBlockButtonText: 'font-medium text-gray-700',
		
		// Divider
		dividerLine: 'bg-gray-200',
		dividerText: 'text-gray-400 text-sm',
		
		// Form fields
		formFieldLabel: 'text-sm font-medium text-gray-700 mb-1',
		formFieldInput: 'border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors',
		formFieldInputShowPasswordButton: 'text-gray-500 hover:text-gray-700',
		
		// Primary button
		formButtonPrimary: 'bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-3 px-4 transition-colors shadow-sm',
		
		// Footer actions (hide sign up link when needed)
		footerAction: 'hidden',
		footerActionLink: 'text-purple-600 hover:text-purple-700 font-medium',
		
		// Identity preview (Avatar section for returning users)
		identityPreviewEditButton: 'text-purple-600 hover:text-purple-700',
		identityPreviewText: 'text-gray-900 font-medium',
		
		// Alerts/Errors
		alert: 'bg-red-50 border border-red-200 rounded-lg p-3',
		alertText: 'text-red-600 text-sm',
		
		// OTP/Verification code input
		otpCodeFieldInput: 'border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500',
		
		// Back button
		backLink: 'text-purple-600 hover:text-purple-700',
		
		// Form
		form: 'space-y-4',
	},
	layout: {
		socialButtonsPlacement: 'bottom' as const,
		socialButtonsVariant: 'blockButton' as const,
		showOptionalFields: false,
	},
};

export function SignInForm() {
	const [hasAdmin, setHasAdmin] = useState<boolean | undefined>(undefined);

	// Check if admin exists
	useEffect(() => {
		async function checkAdmin() {
			try {
				const res = await fetch('/api/admin/has-admin');
				const data = await res.json();
				setHasAdmin(data.hasAdmin);
			} catch (error) {
				console.error('Error checking admin:', error);
				setHasAdmin(true); // Default to showing sign in
			}
		}

		checkAdmin();
	}, []);

	// Hide "Don't have an account? Sign up" link when admin exists
	useEffect(() => {
		if (hasAdmin === true) {
			const observer = new MutationObserver(() => {
				const signUpLinks = document.querySelectorAll('a[href*="sign-up"]');
				signUpLinks.forEach((link) => {
					const parent = link.parentElement;
					if (parent && parent.textContent?.includes("Don't have an account")) {
						parent.style.display = 'none';
					}
				});

				const allLinks = document.querySelectorAll('a');
				allLinks.forEach((link) => {
					if (link.textContent?.trim() === 'Sign up') {
						const container = link.closest('div');
						if (container && container.textContent?.includes("Don't have an account")) {
							container.style.display = 'none';
						}
					}
				});
			});

			observer.observe(document.body, {
				childList: true,
				subtree: true,
			});

			return () => observer.disconnect();
		}
	}, [hasAdmin]);

	// Show loading while checking
	if (hasAdmin === undefined) {
		return (
			<div className="w-full min-h-screen bg-purple-600 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
					<p className="text-purple-100">Loading...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full min-h-screen bg-purple-600 flex items-center justify-center p-4">
			{/* Modal Container */}
			<div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full flex">
				{/* Left Panel - Auth Form */}
				<div className="w-full md:w-1/2 p-8 md:p-10">
					{/* Conditional SignUp/SignIn */}
					{!hasAdmin ? (
						<>
							<SignUp
								routing="hash"
								signInUrl="/sign-in"
								appearance={clerkAppearance}
							/>
							<div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
								<p className="text-sm text-green-800 text-center">
									<strong>🔐 First Time Setup:</strong> Create the first admin account to get started.
								</p>
							</div>
						</>
					) : (
						<>
							<SignIn
								routing="hash"
								signInUrl="/sign-in"
								appearance={clerkAppearance}
							/>
							<div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
								<p className="text-sm text-purple-800 text-center">
									<strong>Employee?</strong> Use the credentials provided by your administrator.
								</p>
							</div>
						</>
					)}

					{/* Terms & Privacy */}
					<div className="mt-6 text-center">
						<p className="text-xs text-gray-500">
							By continuing, you agree to El-Elyon&apos;s{' '}
							<a href="#" className="text-purple-600 hover:underline">Terms of Use</a>.
							{' '}Read our{' '}
							<a href="#" className="text-purple-600 hover:underline">Privacy Policy</a>.
						</p>
					</div>

					{/* Footer */}
					<div className="mt-6 pt-4 border-t border-gray-200 text-center">
						<p className="text-xs text-gray-500">
							powered by{' '}
							<span className="font-semibold text-gray-700">
								Bold Ideas Innovations Ltd
							</span>
						</p>
					</div>
				</div>

				{/* Right Panel - Branding */}
				<div className="hidden md:flex md:w-1/2 relative bg-gradient-to-br from-purple-100 to-purple-200 items-center justify-center p-8">
					<div className="text-center">
						<div className="w-32 h-32 mx-auto mb-6 rounded-full bg-white/80 shadow-lg flex items-center justify-center">
							<span className="text-5xl">🏠</span>
						</div>
						<h2 className="text-2xl font-bold text-purple-900 mb-2">
							El-Elyon Properties
						</h2>
						<p className="text-purple-700">
							Care Management Portal
						</p>
						<div className="mt-8 space-y-2 text-sm text-purple-600">
							<p>✓ Resident Care Tracking</p>
							<p>✓ Staff Management</p>
							<p>✓ Compliance Monitoring</p>
						</div>
					</div>
					{/* Decorative elements */}
					<div className="absolute top-8 left-8 w-16 h-16 bg-purple-300 rounded-full opacity-40 blur-xl"></div>
					<div className="absolute bottom-12 right-12 w-24 h-24 bg-purple-400 rounded-full opacity-30 blur-xl"></div>
					<div className="absolute top-1/3 right-8 w-8 h-8 bg-purple-500 rounded-full opacity-20"></div>
				</div>
			</div>
		</div>
	);
}