/**
 * Sentry Server Configuration
 * Error tracking for server-side code
 */

import * as Sentry from '@sentry/nextjs';

const SENTRY_DSN = process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
	dsn: SENTRY_DSN,

	// Adjust this value in production, or use tracesSampler for greater control
	tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

	// Set sampling rate for profiling
	profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,

	// Only enable in production or when explicitly configured
	enabled: process.env.NODE_ENV === 'production' || !!SENTRY_DSN,

	// Environment
	environment: process.env.NODE_ENV || 'development',

	// Ignore certain errors
	ignoreErrors: [
		// Database connection errors (handled by health check)
		'ECONNREFUSED',
		// Clerk errors (already logged)
		'ClerkAPIResponseError',
	],

	// Before sending, add server context
	beforeSend(event, hint) {
		// Don't send errors in development unless explicitly enabled
		if (process.env.NODE_ENV === 'development' && !SENTRY_DSN) {
			return null;
		}

		// Add custom tags
		event.tags = {
			...event.tags,
			server: 'api',
		};

		return event;
	},

	// Release tracking
	release: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
});
