// lib/env-validation.ts
const requiredEnvVars = [
	'DATABASE_URL',
	'AWS_REGION',
	'AWS_ENDPOINT_URL',
	'AWS_ACCESS_KEY_ID',
	'AWS_SECRET_ACCESS_KEY',
	'AWS_S3_BUCKET_NAME',
	'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
	'CLERK_SECRET_KEY',
] as const;

// Optional but recommended env vars (including security keys for production)
const recommendedEnvVars = [
	'SENTRY_DSN', // Error tracking
	'KV_REST_API_URL', // Rate limiting
	'KV_REST_API_TOKEN', // Rate limiting
	'NEXT_PUBLIC_APP_URL', // CORS configuration and email links
	'EMAIL_FROM', // Email sender address
	'CLERK_WEBHOOK_SECRET', // Webhook signature verification
	'RESEND_API_KEY', // Email service
	'ADMIN_BOOTSTRAP_SECRET', // Admin creation security
	'INTERNAL_API_KEY', // Internal API authentication
	'CRON_SECRET', // Cron job authentication
] as const;

export function validateEnvironment() {
	const missing: string[] = [];
	const invalid: string[] = [];
	const missingRecommended: string[] = [];

	// Check required variables
	for (const key of requiredEnvVars) {
		const value = process.env[key];

		if (!value) {
			missing.push(key);
		} else if (value.trim() === '') {
			invalid.push(key);
		}
	}

	// Check recommended variables (non-fatal)
	for (const key of recommendedEnvVars) {
		const value = process.env[key];
		if (!value) {
			missingRecommended.push(key);
		}
	}

	// Throw error for required variables
	if (missing.length > 0 || invalid.length > 0) {
		const errors: string[] = [];

		if (missing.length > 0) {
			errors.push(`Missing: ${missing.join(', ')}`);
		}
		if (invalid.length > 0) {
			errors.push(`Empty: ${invalid.join(', ')}`);
		}

		throw new Error(
			`Environment validation failed:\n${errors.join('\n')}\n\n` + 'Please check your .env.local file.'
		);
	}

	// Warn about missing recommended variables
	if (missingRecommended.length > 0) {
		console.warn(
			`⚠️  Recommended environment variables not set: ${missingRecommended.join(', ')}\n` +
				'Some features may not work optimally.'
		);
	}

	console.log('✅ Environment variables validated successfully');
}
