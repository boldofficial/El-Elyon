import type {Metadata} from 'next';
import { Analytics } from '@vercel/analytics/next';
import {ClerkProvider} from '@clerk/nextjs';
import {Geist, Geist_Mono} from 'next/font/google';
import './globals.css';

const geistSans = Geist({
	variable: '--font-geist-sans',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
});

// Custom localization for Clerk text
const clerkLocalization = {
	signUp: {
		start: {
			title: 'Create Your Admin Account',
			subtitle: 'Set up your El-Elyon Properties management portal',
		},
	},
	signIn: {
		start: {
			title: 'Welcome Back',
			subtitle: 'Sign in to access your dashboard',
		},
	},
};

export const metadata: Metadata = {
	title: 'El-Elyon - Care Management System',
	description: 'Comprehensive care management and compliance tracking system',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<ClerkProvider localization={clerkLocalization}>
			<html lang="en">
				<body
					className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
					{children}
					<Analytics />
				</body>
			</html>
		</ClerkProvider>
	);
}
