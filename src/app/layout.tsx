import type {Metadata, Viewport} from 'next';
import { Analytics } from '@vercel/analytics/next';
import {ClerkProvider} from '@clerk/nextjs';
import {Geist, Geist_Mono} from 'next/font/google';
import {PwaRefreshButton} from '@/components/shared/PwaRefreshButton';
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
	appleWebApp: {
		capable: true,
		statusBarStyle: 'black-translucent',
		title: 'El-Elyon',
	},
	formatDetection: {
		telephone: false,
	},
	icons: {
		icon: [
			{url: '/favicon.png', sizes: '32x32', type: 'image/png'},
			{url: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png'},
			{url: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png'},
		],
		shortcut: '/favicon.ico',
		apple: [
			{url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png'},
		],
	},
};

export const viewport: Viewport = {
	width: 'device-width',
	initialScale: 1,
	maximumScale: 5,
	themeColor: '#0B1220',
	viewportFit: 'cover',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<ClerkProvider localization={clerkLocalization}>
			<html lang="en">
				<head>
					<link rel="manifest" href="/manifest.json" />
					<script
						dangerouslySetInnerHTML={{
							__html: `
								if ('serviceWorker' in navigator) {
									// Register service worker
									window.addEventListener('load', () => {
										navigator.serviceWorker.register('/sw.js', { scope: '/' }).then(
											(reg) => console.log('[PWA] SW registered:', reg.scope),
											(err) => console.error('[PWA] SW failed:', err)
										);
									});

									// Store install prompt for user-triggered install
									window.addEventListener('beforeinstallprompt', (e) => {
										e.preventDefault();
										window.__pwaPrompt = e;
										console.log('[PWA] Install prompt ready');

										// Show install banner
										var banner = document.createElement('div');
										banner.id = 'pwa-install-banner';
										banner.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#0B1220;color:white;padding:12px 16px;display:flex;align-items:center;justify-content:space-between;z-index:99999;box-shadow:0 -2px 10px rgba(0,0,0,0.3);font-family:system-ui,sans-serif;';
										banner.innerHTML = '<div style="flex:1"><strong>Install El-Elyon</strong><br><span style="font-size:13px;opacity:0.8">Add to home screen for quick access</span></div><button id="pwa-install-btn" style="background:#3b82f6;color:white;border:none;padding:10px 20px;border-radius:8px;font-weight:600;cursor:pointer;margin-left:12px;font-size:14px">Install</button><button id="pwa-dismiss-btn" style="background:none;color:white;border:none;padding:8px;cursor:pointer;margin-left:4px;font-size:18px;opacity:0.6">&times;</button>';
										document.body.appendChild(banner);

										document.getElementById('pwa-install-btn').onclick = function() {
											window.__pwaPrompt.prompt();
											window.__pwaPrompt.userChoice.then(function(result) {
												console.log('[PWA] User choice:', result.outcome);
												window.__pwaPrompt = null;
												banner.remove();
											});
										};
										document.getElementById('pwa-dismiss-btn').onclick = function() {
											banner.remove();
										};
									});

									window.addEventListener('appinstalled', () => {
										console.log('[PWA] App installed');
										var b = document.getElementById('pwa-install-banner');
										if (b) b.remove();
									});
								}
							`,
						}}
					/>
				</head>
				<body
					className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
					{children}
					<PwaRefreshButton />
					<Analytics />
				</body>
			</html>
		</ClerkProvider>
	);
}
