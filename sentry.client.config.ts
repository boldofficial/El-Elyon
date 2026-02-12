/**
 * Sentry Configuration
 * Error tracking and performance monitoring
 * Documentation: https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
	dsn: SENTRY_DSN,

	// Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring
	// Adjust this value in production
	tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

	// Set sampling rate for profiling
	profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

	// Only enable in production or when explicitly configured
	enabled: process.env.NODE_ENV === 'production' || !!SENTRY_DSN,

	// Environment
	environment: process.env.NODE_ENV || 'development',

	// Ignore certain errors
	ignoreErrors: [
		// Browser extensions
		'top.GLOBALS',
		// Random network errors
		'NetworkError',
		'Failed to fetch',
		// Clerk errors (handled separately)
		'ClerkAPIResponseError',
	],

	// Before sending error, add user context
	beforeSend(event, hint) {
		// Don't send errors in development unless explicitly enabled
		if (process.env.NODE_ENV === 'development' && !SENTRY_DSN) {
			return null;
		}

		// Add custom filtering logic here if needed
		return event;
	},

	// Integrations
	integrations: [
		// Automatically instrument Next.js API routes
		Sentry.browserTracingIntegration(),
	],

	// Release tracking
	release: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
});
