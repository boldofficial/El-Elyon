'use client';

import {SignIn, SignUp} from '@clerk/nextjs';
import {useEffect, useState} from 'react';

// Enhanced appearance configuration for purple Canva-style theme
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
		fontSize: '0.9375rem',
		spacingUnit: '1rem',
	},
	elements: {
		// Root container
		rootBox: 'mx-auto w-full flex items-center justify-center flex-col',
		card: 'shadow-none border-0 bg-transparent',
		
		// Header - improved spacing and sizing
		headerTitle: 'text-2xl font-bold text-gray-900 mb-2',
		headerSubtitle: 'text-gray-600 mb-6 text-base',
		
		// Social buttons - enhanced with better transitions
		socialButtonsBlockButton: 'border border-gray-300 hover:bg-gray-50 transition-all duration-200 rounded-lg shadow-sm',
		socialButtonsBlockButtonText: 'font-medium text-gray-700',
		socialButtonsProviderIcon: 'w-5 h-5',
		
		// Divider
		dividerLine: 'bg-gray-200',
		dividerText: 'text-gray-400 text-sm px-4',
		
		// Form fields - improved spacing and styling
		formFieldLabel: 'text-sm font-semibold text-gray-700 mb-2',
		formFieldInput: 'border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all duration-200 text-base',
		formFieldInputShowPasswordButton: 'text-gray-500 hover:text-gray-700 transition-colors',
		
		// Row for first/last name
		formFieldRow: 'gap-4',
		
		// Primary button - enhanced with better hover effects
		formButtonPrimary: 'bg-purple-600 hover:bg-purple-700 text-white font-semibold rounded-lg py-3.5 px-6 transition-all duration-200 shadow-md hover:shadow-lg transform hover:-translate-y-0.5',
		
		// Footer actions
		footerAction: 'hidden',
		footerActionLink: 'text-purple-600 hover:text-purple-700 font-medium transition-colors',
		footerActionText: 'text-gray-600 text-sm',
		
		// Identity preview
		identityPreviewEditButton: 'text-purple-600 hover:text-purple-700 transition-colors',
		identityPreviewText: 'text-gray-900 font-medium',
		
		// Alerts/Errors - better styling
		alert: 'bg-red-50 border border-red-200 rounded-lg p-4 mb-4',
		alertText: 'text-red-700 text-sm font-medium',
		
		// OTP/Verification code input
		otpCodeFieldInput: 'border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 text-center text-lg font-semibold',
		
		// Back button
		backLink: 'text-purple-600 hover:text-purple-700 inline-flex items-center gap-1 transition-colors',
		
		// Form - increased spacing
		form: 'space-y-5',
		formFieldGroup: 'space-y-5',
		
		// Password field messages
		formFieldSuccessText: 'text-green-600 text-sm font-medium mt-2',
		formFieldErrorText: 'text-red-600 text-sm font-medium mt-2',
		formFieldHintText: 'text-gray-500 text-sm mt-2',
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

	// Enhanced loading state
	if (hasAdmin === undefined) {
		return (
			<div className="w-full min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center">
				<div className="text-center">
					<div className="relative mb-6">
						<div className="animate-spin rounded-full h-16 w-16 border-4 border-purple-200 border-t-white mx-auto"></div>
						<div className="absolute inset-0 rounded-full h-16 w-16 border-4 border-transparent border-t-purple-300 animate-ping mx-auto"></div>
					</div>
					<p className="text-white text-lg font-medium">Loading El-Elyon Portal...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full min-h-screen bg-purple-600 flex items-center justify-center p-4">
			{/* Modal Container */}
			<div className="bg-white rounded-2xl shadow-2xl overflow-hidden max-w-4xl w-full flex">
				{/* Left Panel - Auth Form */}
				<div className="w-full md:w-1/2 p-8 md:p-12">
					{/* Conditional SignUp/SignIn */}
					{!hasAdmin ? (
						<>
							<SignUp
								routing="hash"
								signInUrl="/sign-in"
								appearance={clerkAppearance}
							/>
							{/* Admin Privileges Info Banner */}
							<div className="mt-8 p-4 bg-gradient-to-r from-amber-50 to-yellow-50 border-l-4 border-amber-500 rounded-lg shadow-sm">
								<div className="flex items-start gap-3">
									<span className="text-2xl">⚡</span>
									<div>
										<p className="text-sm font-semibold text-amber-900 mb-1">
											Full Admin Access
										</p>
										<p className="text-xs text-amber-700">
											You&apos;ll have complete control: manage staff, residents, compliance, and system settings.
										</p>
									</div>
								</div>
							</div>
						</>
					) : (
						<>
							<SignIn
								routing="hash"
								signInUrl="/sign-in"
								appearance={clerkAppearance}
							/>
							{/* Enhanced Employee Login Banner */}
							<div className="mt-8 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-l-4 border-purple-500 rounded-lg shadow-sm">
								<div className="flex items-start gap-3">
									<span className="text-2xl">👋</span>
									<div>
										<p className="text-sm font-semibold text-purple-900 mb-1">
											Employee Login
										</p>
										<p className="text-xs text-purple-700">
											Use the credentials provided by your administrator to access the portal.
										</p>
									</div>
								</div>
							</div>
						</>
					)}

					{/* Enhanced Terms & Privacy */}
					<div className="mt-8 text-center">
						<p className="text-sm text-gray-600 leading-relaxed">
							By continuing, you agree to El-Elyon&apos;s{' '}
							<a href="/terms" className="text-purple-600 hover:text-purple-700 font-medium underline decoration-1 underline-offset-2 transition-colors">
								Terms of Use
							</a>
							.{' '}Read our{' '}
							<a href="/privacy" className="text-purple-600 hover:text-purple-700 font-medium underline decoration-1 underline-offset-2 transition-colors">
								Privacy Policy
							</a>
							.
						</p>
					</div>

					{/* Footer - Less prominent */}
					<div className="mt-6 pt-4 border-t border-gray-100 text-center">
						<p className="text-xs text-gray-400">
							powered by{' '}
							<span className="font-medium text-gray-500">
								Bold Ideas Innovations Ltd
							</span>
						</p>
					</div>
				</div>

				{/* Right Panel - Enhanced Branding */}
				<div className="hidden md:flex md:w-1/2 relative bg-gradient-to-br from-purple-100 via-purple-50 to-indigo-100 items-center justify-center p-12">
					<div className="text-center relative z-10">
						{/* Enhanced Logo */}
						<div className="w-36 h-36 mx-auto mb-8 rounded-full bg-white shadow-xl flex items-center justify-center transform hover:scale-105 transition-transform duration-300">
							<span className="text-6xl">🏠</span>
						</div>
						
						<h2 className="text-3xl font-bold text-purple-900 mb-3">
							El-Elyon Properties
						</h2>
						<p className="text-lg text-purple-700 mb-8 font-medium">
							Care Management Portal
						</p>
						
						{/* Enhanced Feature List */}
						<div className="mt-10 space-y-3 text-left max-w-xs mx-auto">
							<div className="flex items-center gap-3 text-purple-700">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">✓</span>
								<span className="text-sm font-medium">Resident Care Tracking</span>
							</div>
							<div className="flex items-center gap-3 text-purple-700">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">✓</span>
								<span className="text-sm font-medium">Staff Management</span>
							</div>
							<div className="flex items-center gap-3 text-purple-700">
								<span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-600 text-white flex items-center justify-center text-xs font-bold">✓</span>
								<span className="text-sm font-medium">Compliance Monitoring</span>
							</div>
						</div>
					</div>
					
					{/* Enhanced decorative elements with animation */}
					<div className="absolute top-8 left-8 w-20 h-20 bg-purple-300 rounded-full opacity-40 blur-2xl animate-pulse"></div>
					<div className="absolute bottom-12 right-12 w-32 h-32 bg-purple-400 rounded-full opacity-30 blur-2xl animate-pulse" style={{animationDelay: '1s'}}></div>
					<div className="absolute top-1/3 right-8 w-10 h-10 bg-purple-500 rounded-full opacity-25"></div>
				</div>
			</div>
		</div>
	);
}