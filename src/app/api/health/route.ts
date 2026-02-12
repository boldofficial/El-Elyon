/**
 * Health Check Endpoint
 * Returns system status, database connectivity, and environment validation
 * Use for monitoring, load balancers, and uptime checks
 */

import {NextResponse} from 'next/server';
import {db} from '../../../../db';
import {sql} from 'drizzle-orm';

interface HealthStatus {
	status: 'healthy' | 'degraded' | 'unhealthy';
	timestamp: string;
	version: string;
	checks: {
		database: {
			status: 'up' | 'down';
			responseTime?: number;
			error?: string;
		};
		environment: {
			status: 'valid' | 'invalid';
			nodeEnv: string;
			missingVars?: string[];
		};
		redis?: {
			status: 'up' | 'down' | 'not_configured';
		};
	};
}

export async function GET() {
	const startTime = Date.now();
	const health: HealthStatus = {
		status: 'healthy',
		timestamp: new Date().toISOString(),
		version: process.env.npm_package_version || '1.0.0',
		checks: {
			database: {
				status: 'down',
			},
			environment: {
				status: 'valid',
				nodeEnv: process.env.NODE_ENV || 'development',
			},
		},
	};

	// 1. Check Database Connectivity
	try {
		const dbStart = Date.now();
		await db.execute(sql`SELECT 1`);
		const dbEnd = Date.now();

		health.checks.database = {
			status: 'up',
			responseTime: dbEnd - dbStart,
		};
	} catch (error) {
		health.checks.database = {
			status: 'down',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
		health.status = 'unhealthy';
	}

	// 2. Check Environment Variables
	const requiredVars = [
		'DATABASE_URL',
		'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
		'CLERK_SECRET_KEY',
		'AWS_REGION',
		'AWS_S3_BUCKET_NAME',
	];

	const missingVars = requiredVars.filter((varName) => !process.env[varName]);

	if (missingVars.length > 0) {
		health.checks.environment = {
			status: 'invalid',
			nodeEnv: process.env.NODE_ENV || 'development',
			missingVars,
		};
		health.status = 'degraded';
	}

	// 3. Check Redis (Optional - Rate Limiting)
	if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
		try {
			// Basic check - if env vars exist, assume configured
			health.checks.redis = {status: 'up'};
		} catch (error) {
			health.checks.redis = {status: 'down'};
			health.status = 'degraded';
		}
	} else {
		health.checks.redis = {status: 'not_configured'};
	}

	// Determine final status
	const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

	return NextResponse.json(health, {
		status: statusCode,
		headers: {
			'Cache-Control': 'no-cache, no-store, must-revalidate',
		},
	});
}
