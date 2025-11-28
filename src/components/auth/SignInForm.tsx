'use client';

import {SignIn, SignUp} from '@clerk/nextjs';
import {useEffect, useState} from 'react';
import Image from 'next/image';

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
				// Target Clerk's sign-up link
				const signUpLinks = document.querySelectorAll('a[href*="sign-up"]');
				signUpLinks.forEach((link) => {
					const parent = link.parentElement;
					if (parent && parent.textContent?.includes("Don't have an account")) {
						parent.style.display = 'none';
					}
				});

				// Alternative: Hide by text content
				const allLinks = document.querySelectorAll('a');
				allLinks.forEach((link) => {
					if (link.textContent?.trim() === 'Sign up') {
						const container = link.closest('div');
						if (
							container &&
							container.textContent?.includes("Don't have an account")
						) {
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
			<div className="w-full min-h-screen bg-[rgb(248_250_252)] dark:bg-neutral-950 px-4 py-10 flex items-center justify-center">
				<div className="text-center">
					<div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
					<p className="text-gray-600">Loading...</p>
				</div>
			</div>
		);
	}

	return (
		<div className="w-full min-h-screen bkg-[rgb(248_250_252)] dark:bg-nkeutral-950 px-4 py-10 flex items-center justify-center">
			{/* Centered, reduced-width container */}
			<div className="mx-auto w-full max-w-[440px] sm:max-w-[480px] md:max-w-[520px] lg:max-w-[560px] bg-kwhite/95 dark:bg-nelutral-900/95 borkder bor,der,k-gray-200 dark:border-neutral-800 roundked-2xl shaldow-lg p-6 sm:p-7 md:p-8">
				{/* Logo Section */}
				<div className="flex justify-center mb-4">
					<div className="relative h-16 w-auto">
						<Image
							src="/logo.png"
							alt="El-Elyon Properties LLC Logo"
							fill
							style={{ objectFit: 'contain' }}
							onError={({ currentTarget }) => {
								currentTarget.style.display = 'none';
								const sibling = currentTarget.nextElementSibling;
								if (sibling) {
									sibling.classList.remove('hidden');
								}
							}}
						/>
					</div>
					{/* cspell:disable-next-line */}
					<div className="text-3xl font-bold hidden">
						<span className="text-black">El-Elyon</span>
						<span className="text-blue-600"> Properties LLC</span>
					</div>
				</div>

				{/* Conditional SignUp/SignIn */}
				{!hasAdmin ? (
					<>
						<SignUp
							routing="hash"
							signInUrl="/sign-in"
							appearance={{
								elements: {
									rootBox: 'mx-auto',
									formButtonPrimary:
										'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white font-semibold rounded-lg px-4 py-2 w-full',
									footerAction: 'hidden',
								},
							}}
						/>
						<div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
							<p className="text-sm text-green-800 text-center">
								<strong>First Time Setup:</strong> Create the first admin
								account to get started.
							</p>
						</div>
					</>
				) : (
					<>
						<SignIn
							routing="hash"
							signInUrl="/sign-in"
							appearance={{
								elements: {
									rootBox: 'mx-auto',
									formButtonPrimary:
										'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 text-white font-semibold rounded-lg px-4 py-2 w-full',
									footerAction: 'hidden',
								},
							}}
						/>
						<div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
							<p className="text-sm text-blue-800 text-center">
								<strong>Employee?</strong> Please use the credentials provided
								by your administrator.
							</p>
						</div>
					</>
				)}

				{/* Footer */}
				<div className="mt-6 text-center">
					<p className="text-xs text-gray-500">
						powered by{' '}
						<span className="font-semibold text-gray-700">
							Bold Ideas Innovations Ltd
						</span>
					</p>
				</div>
			</div>
		</div>
	);
}
