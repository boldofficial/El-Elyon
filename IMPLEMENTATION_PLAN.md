# Implementation Plan - Security & Reliability Improvements
**Created:** February 4, 2026  
**Status:** ✅ Memos Migration Executed - 500 Errors Resolved  
**Estimated Total Time:** 8-12 business days

---

## 🎯 PHASE 1: CRITICAL SECURITY (Days 1-3) - 20 hours

### Task 1.1: Environment Variable Validation
**Priority:** CRITICAL  
**Time:** 2 hours  
**Dependencies:** None

**Implementation:**

1. Create `lib/env-validation.ts`:
```typescript
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

export function validateEnvironment() {
  const missing: string[] = [];
  const invalid: string[] = [];

  for (const key of requiredEnvVars) {
    const value = process.env[key];
    
    if (!value) {
      missing.push(key);
    } else if (value.trim() === '') {
      invalid.push(key);
    }
  }

  if (missing.length > 0 || invalid.length > 0) {
    const errors: string[] = [];
    
    if (missing.length > 0) {
      errors.push(`Missing: ${missing.join(', ')}`);
    }
    if (invalid.length > 0) {
      errors.push(`Empty: ${invalid.join(', ')}`);
    }
    
    throw new Error(
      `Environment validation failed:\n${errors.join('\n')}\n\n` +
      'Please check your .env.local file.'
    );
  }

  console.log('✅ Environment variables validated successfully');
}
```

2. Update `db/index.ts`:
```typescript
import {drizzle} from 'drizzle-orm/neon-http';
import {neon} from '@neondatabase/serverless';
import * as schema from './schema';
import {validateEnvironment} from '../lib/env-validation';

// Validate environment on startup
validateEnvironment();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('Missing DATABASE_URL environment variable');
}

const sql = neon(connectionString);
export const db = drizzle(sql, {schema});
```

**Testing:**
- [ ] Remove one env var temporarily, verify error message
- [ ] Verify production build succeeds with all vars present
- [ ] Check Vercel deployment logs for validation message

---

### Task 1.2: Implement Rate Limiting
**Priority:** CRITICAL  
**Time:** 4 hours  
**Dependencies:** Vercel KV setup

**Implementation:**

1. Install dependencies:
```bash
npm install @upstash/ratelimit @upstash/redis
```

2. Set up Vercel KV:
   - Go to Vercel Dashboard → Storage → Create KV
   - Copy connection strings to environment variables:
     - `KV_REST_API_URL`
     - `KV_REST_API_TOKEN`

3. Create `src/middleware.ts`:
```typescript
import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';
import {Ratelimit} from '@upstash/ratelimit';
import {Redis} from '@upstash/redis';

// Create Redis client
const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

// Define different rate limits for different routes
const apiRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, '10s'), // 20 requests per 10 seconds
  analytics: true,
});

const authRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60s'), // 5 attempts per minute
  analytics: true,
});

const uploadRateLimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(5, '60s'), // 5 uploads per minute
  analytics: true,
});

export async function middleware(req: NextRequest) {
  // Skip rate limiting for health checks and static assets
  if (
    req.nextUrl.pathname.startsWith('/_next') ||
    req.nextUrl.pathname.startsWith('/static') ||
    req.nextUrl.pathname === '/api/health'
  ) {
    return NextResponse.next();
  }

  // Get identifier (IP or user ID)
  const ip = req.ip ?? req.headers.get('x-forwarded-for') ?? '127.0.0.1';
  const identifier = `${ip}:${req.nextUrl.pathname}`;

  // Choose rate limit based on route
  let ratelimit = apiRateLimit;
  
  if (req.nextUrl.pathname.startsWith('/api/auth')) {
    ratelimit = authRateLimit;
  } else if (
    req.nextUrl.pathname.includes('/upload') ||
    req.nextUrl.pathname.includes('/generate-upload-url')
  ) {
    ratelimit = uploadRateLimit;
  }

  try {
    const {success, limit, reset, remaining} = await ratelimit.limit(identifier);

    const response = success
      ? NextResponse.next()
      : NextResponse.json(
          {error: 'Too many requests. Please try again later.'},
          {status: 429}
        );

    // Add rate limit headers
    response.headers.set('X-RateLimit-Limit', limit.toString());
    response.headers.set('X-RateLimit-Remaining', remaining.toString());
    response.headers.set('X-RateLimit-Reset', reset.toString());

    return response;
  } catch (error) {
    console.error('Rate limiting error:', error);
    // Fail open - don't block requests if rate limiting fails
    return NextResponse.next();
  }
}

export const config = {
  matcher: '/api/:path*',
};
```

4. Update `lib/env-validation.ts` to include KV vars:
```typescript
const requiredEnvVars = [
  // ... existing vars
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
] as const;
```

**Testing:**
- [ ] Test rapid API requests, verify 429 responses
- [ ] Check rate limit headers in response
- [ ] Verify different limits for different routes
- [ ] Test that rate limits reset correctly

---

### Task 1.3: Fix SQL Injection Risk in JSONB Queries
**Priority:** CRITICAL  
**Time:** 6 hours  
**Dependencies:** None

**Implementation:**

1. Update `db/queries/memos.ts`:
```typescript
import {db} from '../index';
import {memos, memosRead} from '../schema';
import {eq, and, or, desc, sql, inArray} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';

export async function getMemos(args: {
	clerkUserId: string;
	limit?: number;
	unreadOnly?: boolean;
}) {
	const {clerkUserId, limit = 50, unreadOnly = false} = args;

	const userRole = await requireCareAccess(clerkUserId);
	const role = userRole.role?.toLowerCase();
	const userLocations = userRole.locations || [];

	// Build conditions array
	const conditions: any[] = [];

	if (role === 'admin') {
		// Admins see all memos
		conditions.push(
			or(
				eq(memos.recipientType, 'all-staff'),
				eq(memos.recipientType, 'all-supervisors'),
				eq(memos.recipientType, 'all-employees'),
				eq(memos.senderClerkUserId, clerkUserId),
				// For selected-users, check if user ID is in targetUsers array
				// Use parameterized approach instead of string interpolation
				sql`${memos.recipientType} = 'selected-users' AND ${memos.targetUsers}::jsonb ? ${clerkUserId}`
			)
		);
	} else if (role === 'supervisor') {
		// For JSONB array containment, create a safe SQL fragment
		// Use sql.raw for the operator but keep values parameterized
		const locationCheckConditions = userLocations.length > 0
			? userLocations.map(loc => 
				sql`${memos.targetLocations}::jsonb ? ${loc}`
			)
			: [];

		conditions.push(
			or(
				eq(memos.recipientType, 'all-supervisors'),
				eq(memos.recipientType, 'all-employees'),
				eq(memos.senderClerkUserId, clerkUserId),
				// Location-based memos
				...(locationCheckConditions.length > 0 
					? [
						and(
							eq(memos.recipientType, 'location'),
							or(...locationCheckConditions)
						),
						and(
							eq(memos.recipientType, 'selected-locations'),
							or(...locationCheckConditions)
						)
					]
					: []
				),
				// Selected users
				sql`${memos.recipientType} = 'selected-users' AND ${memos.targetUsers}::jsonb ? ${clerkUserId}`
			)
		);
	} else {
		// Staff
		const locationCheckConditions = userLocations.length > 0
			? userLocations.map(loc => 
				sql`${memos.targetLocations}::jsonb ? ${loc}`
			)
			: [];

		conditions.push(
			or(
				eq(memos.recipientType, 'all-staff'),
				eq(memos.recipientType, 'all-employees'),
				eq(memos.senderClerkUserId, clerkUserId),
				// Location-based
				...(locationCheckConditions.length > 0 
					? [
						and(
							eq(memos.recipientType, 'location'),
							or(...locationCheckConditions)
						)
					]
					: []
				),
				// Selected users
				sql`${memos.recipientType} = 'selected-users' AND ${memos.targetUsers}::jsonb ? ${clerkUserId}`
			)
		);
	}

	// Build query
	let query = db
		.select({
			id: memos.id,
			title: memos.title,
			content: memos.content,
			senderClerkUserId: memos.senderClerkUserId,
			senderName: memos.senderName,
			recipientType: memos.recipientType,
			targetLocations: memos.targetLocations,
			targetUsers: memos.targetUsers,
			priority: memos.priority,
			expiresAt: memos.expiresAt,
			createdAt: memos.createdAt,
		})
		.from(memos)
		.where(and(...conditions))
		.orderBy(desc(memos.createdAt))
		.limit(limit);

	const results = await query;

	// If unreadOnly, filter by read status
	if (unreadOnly) {
		const memoIds = results.map((m) => m.id);
		if (memoIds.length === 0) return [];

		const readRecords = await db
			.select({memoId: memosRead.memoId})
			.from(memosRead)
			.where(
				and(
					inArray(memosRead.memoId, memoIds),
					eq(memosRead.clerkUserId, clerkUserId)
				)
			);

		const readMemoIds = new Set(readRecords.map((r) => r.memoId));
		return results.filter((m) => !readMemoIds.has(m.id));
	}

	return results;
}

// Similar updates for getUnreadMemoCount...
export async function getUnreadMemoCount(clerkUserId: string) {
	const userRole = await requireCareAccess(clerkUserId);
	const role = userRole.role?.toLowerCase();
	const userLocations = userRole.locations || [];

	const conditions: any[] = [];

	if (role === 'admin') {
		conditions.push(
			or(
				eq(memos.recipientType, 'all-staff'),
				eq(memos.recipientType, 'all-supervisors'),
				eq(memos.recipientType, 'all-employees'),
				sql`${memos.recipientType} = 'selected-users' AND ${memos.targetUsers}::jsonb ? ${clerkUserId}`
			)
		);
	} else if (role === 'supervisor') {
		const locationCheckConditions = userLocations.length > 0
			? userLocations.map(loc => 
				sql`${memos.targetLocations}::jsonb ? ${loc}`
			)
			: [];

		conditions.push(
			or(
				eq(memos.recipientType, 'all-supervisors'),
				eq(memos.recipientType, 'all-employees'),
				...(locationCheckConditions.length > 0 
					? [
						and(
							eq(memos.recipientType, 'location'),
							or(...locationCheckConditions)
						),
						and(
							eq(memos.recipientType, 'selected-locations'),
							or(...locationCheckConditions)
						)
					]
					: []
				),
				sql`${memos.recipientType} = 'selected-users' AND ${memos.targetUsers}::jsonb ? ${clerkUserId}`
			)
		);
	} else {
		const locationCheckConditions = userLocations.length > 0
			? userLocations.map(loc => 
				sql`${memos.targetLocations}::jsonb ? ${loc}`
			)
			: [];

		conditions.push(
			or(
				eq(memos.recipientType, 'all-staff'),
				eq(memos.recipientType, 'all-employees'),
				...(locationCheckConditions.length > 0 
					? [
						and(
							eq(memos.recipientType, 'location'),
							or(...locationCheckConditions)
						)
					]
					: []
				),
				sql`${memos.recipientType} = 'selected-users' AND ${memos.targetUsers}::jsonb ? ${clerkUserId}`
			)
		);
	}

	const allMemos = await db
		.select({id: memos.id})
		.from(memos)
		.where(and(...conditions));

	if (allMemos.length === 0) return 0;

	const readRecords = await db
		.select({memoId: memosRead.memoId})
		.from(memosRead)
		.where(
			and(
				inArray(memosRead.memoId, allMemos.map((m) => m.id)),
				eq(memosRead.clerkUserId, clerkUserId)
			)
		);

	return allMemos.length - readRecords.length;
}
```

**Key Changes:**
- Use individual `sql` templates for each location check instead of `.join(',')`
- Each value is now properly parameterized
- No string concatenation in SQL templates

**Testing:**
- [ ] Test memo retrieval for all roles
- [ ] Verify location filtering works correctly
- [ ] Test with special characters in location names
- [ ] Check unread count accuracy

---

### Task 1.4: Configure CORS and Security Headers
**Priority:** CRITICAL  
**Time:** 3 hours  
**Dependencies:** None

**Implementation:**

1. Update `next.config.ts`:
```typescript
import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
	async headers() {
		return [
			// Security headers for all routes
			{
				source: '/:path*',
				headers: [
					{
						key: 'X-Frame-Options',
						value: 'DENY',
					},
					{
						key: 'X-Content-Type-Options',
						value: 'nosniff',
					},
					{
						key: 'Referrer-Policy',
						value: 'strict-origin-when-cross-origin',
					},
					{
						key: 'X-XSS-Protection',
						value: '1; mode=block',
					},
					{
						key: 'Permissions-Policy',
						value: 'camera=(), microphone=(), geolocation=()',
					},
				],
			},
			// HTTPS Strict Transport Security (only in production)
			...(process.env.NODE_ENV === 'production'
				? [
						{
							source: '/:path*',
							headers: [
								{
									key: 'Strict-Transport-Security',
									value: 'max-age=31536000; includeSubDomains; preload',
								},
							],
						},
				  ]
				: []),
			// CORS headers for API routes
			{
				source: '/api/:path*',
				headers: [
					{
						key: 'Access-Control-Allow-Credentials',
						value: 'true',
					},
					{
						key: 'Access-Control-Allow-Origin',
						value: process.env.NEXT_PUBLIC_APP_URL || '*',
					},
					{
						key: 'Access-Control-Allow-Methods',
						value: 'GET,DELETE,PATCH,POST,PUT',
					},
					{
						key: 'Access-Control-Allow-Headers',
						value:
							'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization',
					},
				],
			},
		];
	},
	
	// Configure body size limit
	experimental: {
		// Add any experimental features here if needed
	},
};

export default nextConfig;
```

2. Add to environment variables:
```
NEXT_PUBLIC_APP_URL=https://your-production-domain.com
```

**Testing:**
- [ ] Check response headers in browser dev tools
- [ ] Verify CORS headers on API requests
- [ ] Test cross-origin requests (if applicable)
- [ ] Verify security headers with securityheaders.com

---

### Task 1.5: Request Body Size Limits
**Priority:** CRITICAL  
**Time:** 1 hour  
**Dependencies:** None

**Implementation:**

1. Create `src/app/api/middleware-utils.ts`:
```typescript
import {NextRequest, NextResponse} from 'next/server';

const MAX_BODY_SIZE = 1024 * 1024; // 1MB default
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for files

export async function validateBodySize(
	req: NextRequest,
	maxSize: number = MAX_BODY_SIZE
): Promise<{valid: boolean; error?: string}> {
	const contentLength = req.headers.get('content-length');

	if (!contentLength) {
		return {valid: true}; // No content-length header, let it proceed
	}

	const size = parseInt(contentLength, 10);

	if (size > maxSize) {
		return {
			valid: false,
			error: `Request body too large. Maximum size: ${maxSize} bytes`,
		};
	}

	return {valid: true};
}

// Use in API routes like this:
export async function validateRequest(req: NextRequest, maxSize?: number) {
	const validation = await validateBodySize(req, maxSize);
	
	if (!validation.valid) {
		return NextResponse.json(
			{error: validation.error},
			{status: 413} // 413 Payload Too Large
		);
	}
	
	return null; // Valid
}
```

2. Update upload routes to use validation:
```typescript
// Example: src/app/api/uploads/route.ts
import {validateRequest} from '../middleware-utils';

export async function POST(req: NextRequest) {
	// Validate request size (10MB for uploads)
	const sizeError = await validateRequest(req, 10 * 1024 * 1024);
	if (sizeError) return sizeError;
	
	// ... rest of upload logic
}
```

**Testing:**
- [ ] Test with large request bodies
- [ ] Verify 413 error responses
- [ ] Check different size limits for different routes

---

## 🎯 PHASE 2: INPUT VALIDATION & ERROR HANDLING (Days 4-5) - 16 hours

### Task 2.1: Add Zod Validation Schemas
**Priority:** HIGH  
**Time:** 6 hours  
**Dependencies:** None

**Implementation:**

1. Install zod:
```bash
npm install zod
```

2. Create `lib/validation-schemas.ts`:
```typescript
import {z} from 'zod';

// Memo schemas
export const memoSchema = z.object({
	title: z.string().min(1, 'Title is required').max(500, 'Title too long'),
	content: z.string().min(1, 'Content is required').max(10000, 'Content too long'),
	recipientType: z.enum([
		'location',
		'all-staff',
		'all-supervisors',
		'all-employees',
		'selected-locations',
		'selected-users',
	]),
	targetLocations: z.array(z.string()).optional().default([]),
	targetUsers: z.array(z.string()).optional().default([]),
	priority: z.enum(['normal', 'high', 'urgent']).default('normal'),
	expiresAt: z.string().datetime().optional(),
});

// Vacation request schemas
export const vacationRequestSchema = z.object({
	startDate: z.string().datetime(),
	endDate: z.string().datetime(),
	reason: z.string().min(1, 'Reason is required').max(1000, 'Reason too long'),
}).refine(
	(data) => new Date(data.endDate) >= new Date(data.startDate),
	{
		message: 'End date must be after or equal to start date',
		path: ['endDate'],
	}
);

export const vacationRequestUpdateSchema = z.object({
	status: z.enum(['approved', 'denied']),
	adminComments: z.string().max(1000, 'Comments too long').optional(),
});

// Resident document schema
export const residentDocumentSchema = z.object({
	residentId: z.string().uuid('Invalid resident ID'),
	title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
	type: z.string().min(1, 'Type is required').max(50, 'Type too long'),
	description: z.string().max(1000, 'Description too long').optional(),
	fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
	fileSize: z.number().int().positive().max(10 * 1024 * 1024, 'File too large (max 10MB)'),
	fileStorageId: z.string().min(1, 'Storage ID is required'),
});

// Fire drill schema
export const fireDrillSchema = z.object({
	location: z.string().min(1, 'Location is required').max(255, 'Location too long'),
	year: z.number().int().min(2020).max(2100),
	sequence: z.number().int().min(1).max(12),
	drillDate: z.string().datetime(),
	conductedBy: z.string().min(1, 'Conductor name is required').max(255, 'Name too long'),
	evacuationTime: z.string().max(50, 'Time too long').optional(),
	notes: z.string().max(2000, 'Notes too long').optional(),
});

// Helper function to validate and return errors
export function validateSchema<T>(
	schema: z.ZodSchema<T>,
	data: unknown
): {success: true; data: T} | {success: false; errors: z.ZodError} {
	const result = schema.safeParse(data);
	
	if (result.success) {
		return {success: true, data: result.data};
	} else {
		return {success: false, errors: result.error};
	}
}

// Helper to format Zod errors for API responses
export function formatZodErrors(error: z.ZodError): Record<string, string> {
	const formatted: Record<string, string> = {};
	
	error.errors.forEach((err) => {
		const path = err.path.join('.');
		formatted[path] = err.message;
	});
	
	return formatted;
}
```

3. Update API routes to use validation. Example for memos:
```typescript
// src/app/api/memos/route.ts
import {memoSchema, validateSchema, formatZodErrors} from '@/lib/validation-schemas';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const body = await req.json();

		// Validate with Zod
		const validation = validateSchema(memoSchema, body);
		
		if (!validation.success) {
			return NextResponse.json(
				{
					error: 'Validation failed',
					fields: formatZodErrors(validation.errors),
				},
				{status: 400}
			);
		}

		const newMemo = await createMemo({
			clerkUserId: userId,
			...validation.data,
			expiresAt: validation.data.expiresAt 
				? new Date(validation.data.expiresAt) 
				: undefined,
		});

		return NextResponse.json(newMemo, {status: 201});
	} catch (error: any) {
		console.error('Error creating memo:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
```

**Files to Update:**
- [ ] `src/app/api/memos/route.ts`
- [ ] `src/app/api/vacation-requests/route.ts`
- [ ] `src/app/api/vacation-requests/[id]/route.ts`
- [ ] `src/app/api/care/resident-documents/route.ts`
- [ ] `src/app/api/documents/fire-drills/route.ts`
- [ ] `src/app/api/documents/smoke-detector-checks/route.ts`

**Testing:**
- [ ] Test with invalid data, verify proper error messages
- [ ] Test field length limits
- [ ] Test date validations
- [ ] Verify successful requests still work

---

### Task 2.2: Sanitize Error Messages
**Priority:** HIGH  
**Time:** 4 hours  
**Dependencies:** None

**Implementation:**

1. Create `lib/error-handler.ts`:
```typescript
interface ErrorResponse {
	message: string;
	code: string;
	statusCode: number;
}

const ERROR_CODES = {
	UNAUTHORIZED: {code: 'UNAUTHORIZED', message: 'Authentication required', status: 401},
	FORBIDDEN: {code: 'FORBIDDEN', message: 'Insufficient permissions', status: 403},
	NOT_FOUND: {code: 'NOT_FOUND', message: 'Resource not found', status: 404},
	VALIDATION_ERROR: {code: 'VALIDATION_ERROR', message: 'Validation failed', status: 400},
	RATE_LIMIT: {code: 'RATE_LIMIT', message: 'Too many requests', status: 429},
	INTERNAL_ERROR: {code: 'INTERNAL_ERROR', message: 'An error occurred', status: 500},
} as const;

export class AppError extends Error {
	constructor(
		public code: keyof typeof ERROR_CODES,
		public details?: Record<string, any>
	) {
		super(ERROR_CODES[code].message);
		this.name = 'AppError';
	}
}

export function sanitizeError(error: unknown): ErrorResponse {
	// Log full error internally for debugging
	console.error('Error occurred:', error);

	// Custom app errors
	if (error instanceof AppError) {
		const errorInfo = ERROR_CODES[error.code];
		return {
			message: errorInfo.message,
			code: error.code,
			statusCode: errorInfo.status,
		};
	}

	// Known error types
	if (error instanceof Error) {
		// Authentication errors
		if (error.message.includes('Unauthorized') || error.message.includes('auth')) {
			return {
				message: 'Authentication required',
				code: 'UNAUTHORIZED',
				statusCode: 401,
			};
		}

		// Permission errors
		if (
			error.message.includes('Forbidden') ||
			error.message.includes('access') ||
			error.message.includes('permission')
		) {
			return {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
				statusCode: 403,
			};
		}

		// Not found errors
		if (error.message.includes('not found')) {
			return {
				message: 'Resource not found',
				code: 'NOT_FOUND',
				statusCode: 404,
			};
		}

		// Development mode - show actual error
		if (process.env.NODE_ENV === 'development') {
			return {
				message: error.message,
				code: 'INTERNAL_ERROR',
				statusCode: 500,
			};
		}
	}

	// Production - hide details
	return {
		message: 'An error occurred. Please try again.',
		code: 'INTERNAL_ERROR',
		statusCode: 500,
	};
}

export function createErrorResponse(error: unknown) {
	const sanitized = sanitizeError(error);
	
	return new Response(
		JSON.stringify({
			error: sanitized.message,
			code: sanitized.code,
		}),
		{
			status: sanitized.statusCode,
			headers: {'Content-Type': 'application/json'},
		}
	);
}
```

2. Create `lib/logger.ts`:
```typescript
type LogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug';

class Logger {
	private shouldLog(level: LogLevel): boolean {
		// In production, only log warnings and errors
		if (process.env.NODE_ENV === 'production') {
			return level === 'warn' || level === 'error';
		}
		return true;
	}

	log(...args: any[]) {
		if (this.shouldLog('log')) {
			console.log('[LOG]', new Date().toISOString(), ...args);
		}
	}

	info(...args: any[]) {
		if (this.shouldLog('info')) {
			console.info('[INFO]', new Date().toISOString(), ...args);
		}
	}

	warn(...args: any[]) {
		if (this.shouldLog('warn')) {
			console.warn('[WARN]', new Date().toISOString(), ...args);
		}
	}

	error(...args: any[]) {
		if (this.shouldLog('error')) {
			console.error('[ERROR]', new Date().toISOString(), ...args);
		}
	}

	debug(...args: any[]) {
		if (this.shouldLog('debug')) {
			console.debug('[DEBUG]', new Date().toISOString(), ...args);
		}
	}
}

export const logger = new Logger();
```

3. Update API routes to use error handler:
```typescript
// Example: src/app/api/memos/route.ts
import {createErrorResponse} from '@/lib/error-handler';
import {logger} from '@/lib/logger';

export async function GET(req: NextRequest) {
	try {
		// ... logic
	} catch (error) {
		logger.error('Error fetching memos:', error);
		return createErrorResponse(error);
	}
}
```

**Files to Update:** All API route handlers (50+ files)

**Testing:**
- [ ] Test error responses in production mode
- [ ] Verify no stack traces leaked
- [ ] Check logs contain full error details
- [ ] Test all error types (401, 403, 404, 500)

---

### Task 2.3: Database Transaction Improvements
**Priority:** HIGH  
**Time:** 6 hours  
**Dependencies:** None

**Implementation:**

1. Update `db/mutations/vacation-requests.ts`:
```typescript
export async function updateVacationRequestStatus(args: {
	clerkUserId: string;
	requestId: string;
	status: 'approved' | 'denied';
	adminComments?: string;
}) {
	const {clerkUserId, requestId, status, adminComments} = args;

	// Wrap in transaction
	return await db.transaction(async (tx) => {
		// Verify admin access
		const userRole = await tx.query.roles.findFirst({
			where: eq(roles.clerkUserId, clerkUserId),
		});

		if (userRole?.role !== 'admin') {
			throw new Error('Only admins can update vacation request status');
		}

		// Get request
		const request = await tx.query.vacationRequests.findFirst({
			where: eq(vacationRequests.id, requestId),
		});

		if (!request) {
			throw new Error('Vacation request not found');
		}

		// Update status
		const [updated] = await tx
			.update(vacationRequests)
			.set({
				status,
				reviewedAt: new Date(),
				reviewedBy: clerkUserId,
				adminComments,
			})
			.where(eq(vacationRequests.id, requestId))
			.returning();

		// Log audit
		await tx.insert(auditLogs).values({
			clerkUserId,
			event: `vacation_request_${status}`,
			timestamp: new Date(),
			deviceId: 'system',
			location: '',
			details: JSON.stringify({
				requestId,
				employeeId: request.clerkUserId,
				status,
			}),
		});

		// TODO: Send email notification (outside transaction)
		// Will be handled after transaction commits
		
		return updated;
	});
}
```

2. Create email notification queue (simple version):
```typescript
// lib/notification-queue.ts
interface NotificationTask {
	type: 'email';
	to: string;
	subject: string;
	body: string;
}

class NotificationQueue {
	private queue: NotificationTask[] = [];

	add(task: NotificationTask) {
		this.queue.push(task);
	}

	async process() {
		while (this.queue.length > 0) {
			const task = this.queue.shift();
			if (task) {
				try {
					// Send email
					await this.sendEmail(task);
				} catch (error) {
					console.error('Failed to send notification:', error);
					// Could add retry logic here
				}
			}
		}
	}

	private async sendEmail(task: NotificationTask) {
		// Import your email service
		// await sendEmail(...);
	}
}

export const notificationQueue = new NotificationQueue();
```

**Other files to update with transactions:**
- [ ] File upload + database record creation
- [ ] Memo creation + audit log
- [ ] User deletion + cascade cleanup
- [ ] ISP publishing + notifications

**Testing:**
- [ ] Test transaction rollback on failures
- [ ] Verify data consistency
- [ ] Test email sending after successful transaction

---

## 🎯 PHASE 3: PERFORMANCE & MONITORING (Days 6-8) - 20 hours

### Task 3.1: Add Missing Database Indexes
**Priority:** MEDIUM  
**Time:** 3 hours  
**Dependencies:** None

**Implementation:**

1. Create migration `drizzle/0004_add_performance_indexes.sql`:
```sql
-- Add composite indexes for frequently queried combinations

-- Memos: Optimize recipient filtering
CREATE INDEX IF NOT EXISTS memos_recipient_type_created_at_idx 
  ON memos (recipient_type, created_at DESC);

-- Vacation requests: Optimize status filtering
CREATE INDEX IF NOT EXISTS vacation_requests_status_created_at_idx 
  ON vacation_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS vacation_requests_clerk_user_id_status_idx
  ON vacation_requests (clerk_user_id, status);

-- Resident logs: Optimize resident-based queries
CREATE INDEX IF NOT EXISTS resident_logs_resident_id_created_at_idx
  ON resident_logs (resident_id, created_at DESC);

-- Shifts: Optimize location-based queries
CREATE INDEX IF NOT EXISTS shifts_location_clock_in_idx
  ON shifts (location, clock_in_time DESC);

-- Incident reports: Optimize location-based queries
CREATE INDEX IF NOT EXISTS incident_reports_location_date_idx
  ON incident_reports (location, incident_date DESC);

-- Employees: Optimize location filtering
CREATE INDEX IF NOT EXISTS employees_locations_idx
  ON employees USING GIN (locations);

-- Audit logs: Optimize event filtering
CREATE INDEX IF NOT EXISTS audit_logs_event_timestamp_idx
  ON audit_logs (event, timestamp DESC);
```

2. Run migration:
```bash
# Copy to Neon SQL Editor and execute
```

**Testing:**
- [ ] Run EXPLAIN ANALYZE on slow queries
- [ ] Verify query plan uses new indexes
- [ ] Monitor query performance improvement

---

### Task 3.2: Implement Health Check Endpoint
**Priority:** MEDIUM  
**Time:** 2 hours  
**Dependencies:** None

**Implementation:**

1. Create `src/app/api/health/route.ts`:
```typescript
import {NextResponse} from 'next/server';
import {db} from '@/db';

export const dynamic = 'force-dynamic';

export async function GET() {
	const startTime = Date.now();

	try {
		// Check database connection
		await db.query.roles.findFirst();
		const dbLatency = Date.now() - startTime;

		return NextResponse.json({
			status: 'healthy',
			timestamp: new Date().toISOString(),
			version: process.env.npm_package_version || '1.0.0',
			checks: {
				database: {
					status: 'healthy',
					latency: `${dbLatency}ms`,
				},
			},
		});
	} catch (error) {
		return NextResponse.json(
			{
				status: 'unhealthy',
				timestamp: new Date().toISOString(),
				error: 'Database connection failed',
			},
			{status: 503}
		);
	}
}
```

**Testing:**
- [ ] Test health endpoint returns 200
- [ ] Test when database is unreachable
- [ ] Set up monitoring to ping this endpoint

---

### Task 3.3: Integrate Sentry Error Tracking
**Priority:** MEDIUM  
**Time:** 4 hours  
**Dependencies:** Sentry account

**Implementation:**

1. Install Sentry:
```bash
npx @sentry/wizard@latest -i nextjs
```

2. Configure `sentry.client.config.ts`:
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
	environment: process.env.NODE_ENV,
	tracesSampleRate: 0.1,
	
	beforeSend(event, hint) {
		// Filter out sensitive data
		if (event.request) {
			delete event.request.cookies;
			delete event.request.headers;
		}
		return event;
	},
});
```

3. Configure `sentry.server.config.ts`:
```typescript
import * as Sentry from '@sentry/nextjs';

Sentry.init({
	dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
	environment: process.env.NODE_ENV,
	tracesSampleRate: 0.1,
	
	integrations: [
		new Sentry.Integrations.Postgres(),
	],
});
```

4. Add to error handler:
```typescript
// lib/error-handler.ts
import * as Sentry from '@sentry/nextjs';

export function sanitizeError(error: unknown): ErrorResponse {
	// Log to Sentry in production
	if (process.env.NODE_ENV === 'production') {
		Sentry.captureException(error);
	}
	
	// ... rest of error handling
}
```

**Testing:**
- [ ] Trigger test error, verify in Sentry dashboard
- [ ] Check error grouping working
- [ ] Verify sensitive data filtered out

---

### Task 3.4: Enhanced File Upload Security
**Priority:** MEDIUM  
**Time:** 5 hours  
**Dependencies:** None

**Implementation:**

1. Update `lib/aws-s3.ts`:
```typescript
import crypto from 'crypto';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = [
	'application/pdf',
	'image/jpeg',
	'image/jpg',
	'image/png',
	'image/webp',
	'text/plain',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export function validateFileUpload(contentType: string, size: number) {
	if (!ALLOWED_MIME_TYPES.includes(contentType as any)) {
		throw new Error(
			`Invalid file type: ${contentType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
		);
	}

	if (size > MAX_FILE_SIZE) {
		throw new Error(`File too large: ${size} bytes. Maximum: ${MAX_FILE_SIZE} bytes`);
	}
}

export function generateSecureFileName(originalName: string): string {
	const ext = originalName.split('.').pop() || '';
	const hash = crypto.randomBytes(16).toString('hex');
	const timestamp = Date.now();
	
	// Sanitize extension
	const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, '');
	
	return `${timestamp}-${hash}.${safeExt}`;
}

export async function generateUploadUrl(
	key: string,
	contentType: string,
	size: number,
	expiresIn = 300 // 5 minutes instead of 1 hour
) {
	// Validate before generating URL
	validateFileUpload(contentType, size);

	const command = new PutObjectCommand({
		Bucket: BUCKET_NAME,
		Key: key,
		ContentType: contentType,
		ContentLength: size, // Enforce size limit
	});

	return await getSignedUrl(s3Client, command, {expiresIn});
}
```

2. Update upload API routes:
```typescript
// src/app/api/uploads/route.ts
import {validateFileUpload, generateSecureFileName} from '@/lib/aws-s3';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const body = await req.json();
		const {fileName, contentType, fileSize} = body;

		// Validate
		try {
			validateFileUpload(contentType, fileSize);
		} catch (error: any) {
			return NextResponse.json({error: error.message}, {status: 400});
		}

		// Generate secure file name
		const secureFileName = generateSecureFileName(fileName);
		const key = `uploads/${userId}/${secureFileName}`;

		// Generate presigned URL with validation
		const uploadUrl = await generateUploadUrl(key, contentType, fileSize);

		return NextResponse.json({
			uploadUrl,
			fileStorageId: key,
			secureFileName,
		});
	} catch (error: any) {
		console.error('Error generating upload URL:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
```

**Testing:**
- [ ] Test invalid file types rejected
- [ ] Test large files rejected
- [ ] Verify presigned URLs expire after 5 minutes
- [ ] Test secure file name generation

---

### Task 3.5: Complete Audit Logging
**Priority:** MEDIUM  
**Time:** 6 hours  
**Dependencies:** None

**Implementation:**

1. Update `db/mutations/vacation-requests.ts` (already covered in Task 2.3)

2. Update `db/mutations/memos.ts`:
```typescript
import {logAudit} from '@/lib/db-helpers';

export async function deleteMemo(args: {
	clerkUserId: string;
	memoId: string;
}) {
	const {clerkUserId, memoId} = args;

	const userRole = await requireCareAccess(clerkUserId);
	const memo = await db.query.memos.findFirst({
		where: eq(memos.id, memoId),
	});

	if (!memo) {
		throw new Error('Memo not found');
	}

	if (memo.senderClerkUserId !== clerkUserId && userRole.role !== 'admin') {
		throw new Error('Only the sender or admin can delete this memo');
	}

	await db.delete(memos).where(eq(memos.id, memoId));

	// Log deletion
	await logAudit({
		clerkUserId,
		event: 'memo_deleted',
		deviceId: 'system',
		location: '',
		details: JSON.stringify({
			memoId,
			title: memo.title,
			recipientType: memo.recipientType,
		}),
	});

	return {success: true};
}
```

3. Add audit logging to other sensitive operations:
   - User role changes
   - Document deletions
   - Location changes
   - Configuration updates

**Files to Update:**
- [ ] `db/mutations/users.ts`
- [ ] `db/mutations/residents.ts`
- [ ] `src/app/api/settings/app/route.ts`
- [ ] `src/app/api/admin/locations/[id]/route.ts`

**Testing:**
- [ ] Verify audit logs created for all sensitive operations
- [ ] Check audit log queryability
- [ ] Test audit log retention

---

## 🎯 PHASE 4: FINAL POLISH (Days 9-10) - 12 hours

### Task 4.1: Remove Excessive Console Logs
**Priority:** LOW-MEDIUM  
**Time:** 4 hours  
**Dependencies:** Task 2.2 (Logger)

**Implementation:**

1. Search and replace all `console.log` with `logger.log`
2. Search and replace all `console.error` with `logger.error`
3. Search and replace all `console.warn` with `logger.warn`

**Tool Command:**
```bash
# Use VS Code search/replace (Ctrl+Shift+H)
# Search: console\.log\(
# Replace: logger.log(

# Search: console\.error\(
# Replace: logger.error(
```

**Files to Update:** 40+ files across API routes

**Testing:**
- [ ] Verify production logs clean
- [ ] Check development logs still visible
- [ ] Test error logging still works

---

### Task 4.2: API Versioning Structure
**Priority:** LOW  
**Time:** 3 hours  
**Dependencies:** None

**Implementation:**

1. Restructure API routes:
```
src/app/api/
  ├── v1/
  │   ├── memos/
  │   ├── vacation-requests/
  │   ├── care/
  │   └── admin/
  └── health/ (unversioned)
```

2. Add version detection:
```typescript
// src/app/api/v1/route.ts
export async function GET() {
	return NextResponse.json({
		version: 'v1',
		status: 'active',
		endpoints: [
			'/api/v1/memos',
			'/api/v1/vacation-requests',
			'/api/v1/care',
			// ... list all endpoints
		],
	});
}
```

**Note:** This is optional for first release, but sets up for future breaking changes.

---

### Task 4.3: Request ID Tracing
**Priority:** LOW  
**Time:** 2 hours  
**Dependencies:** None

**Implementation:**

1. Update `src/middleware.ts`:
```typescript
import {nanoid} from 'nanoid';

export async function middleware(req: NextRequest) {
	// Add request ID
	const requestId = req.headers.get('x-request-id') || nanoid();
	req.headers.set('x-request-id', requestId);

	// Rate limiting...
	// ...existing middleware logic

	// Add request ID to response
	const response = NextResponse.next();
	response.headers.set('x-request-id', requestId);
	
	return response;
}
```

2. Update logger to include request ID:
```typescript
// lib/logger.ts
export function getRequestId(): string | null {
	// In API routes, extract from headers
	// This is a simplified version
	return globalThis.__requestId || null;
}

class Logger {
	log(...args: any[]) {
		const requestId = getRequestId();
		const prefix = requestId ? `[${requestId}]` : '';
		console.log('[LOG]', prefix, new Date().toISOString(), ...args);
	}
	// ... same for other methods
}
```

**Testing:**
- [ ] Verify request IDs in headers
- [ ] Check logs include request IDs
- [ ] Test tracing across multiple services

---

### Task 4.4: Documentation Updates
**Priority:** LOW  
**Time:** 3 hours  
**Dependencies:** All previous tasks

**Implementation:**

1. Update README.md with:
   - Security features implemented
   - Rate limiting configuration
   - Error handling approach
   - Monitoring setup

2. Create API documentation
3. Document deployment process
4. Create runbook for common issues

---

## 📋 DEPLOYMENT CHECKLIST

### Pre-Deployment:
- [ ] All tests passing
- [ ] Environment variables configured in Vercel
- [ ] Vercel KV database created and configured
- [ ] Sentry project created and DSN configured
- [ ] Database migrations executed (including 0004)
- [ ] Security headers verified
- [ ] Rate limiting tested
- [ ] Error tracking verified

### Deployment:
- [ ] Deploy to staging environment first
- [ ] Run smoke tests on staging
- [ ] Monitor error rates for 24 hours
- [ ] Deploy to production
- [ ] Monitor for first 48 hours

### Post-Deployment:
- [ ] Verify health check endpoint
- [ ] Check Sentry for errors
- [ ] Monitor rate limit hits
- [ ] Review audit logs
- [ ] Load test critical endpoints

---

## 📊 PROGRESS TRACKING

### Phase 1: CRITICAL (Days 1-3)
- [ ] Task 1.1: Environment validation (2h)
- [ ] Task 1.2: Rate limiting (4h)
- [ ] Task 1.3: SQL injection fix (6h)
- [ ] Task 1.4: CORS & security headers (3h)
- [ ] Task 1.5: Body size limits (1h)

### Phase 2: HIGH (Days 4-5)
- [ ] Task 2.1: Zod validation (6h)
- [ ] Task 2.2: Error sanitization (4h)
- [ ] Task 2.3: Transactions (6h)

### Phase 3: MEDIUM (Days 6-8)
- [ ] Task 3.1: Database indexes (3h)
- [ ] Task 3.2: Health check (2h)
- [ ] Task 3.3: Sentry integration (4h)
- [ ] Task 3.4: File upload security (5h)
- [ ] Task 3.5: Audit logging (6h)

### Phase 4: POLISH (Days 9-10)
- [ ] Task 4.1: Remove console.logs (4h)
- [ ] Task 4.2: API versioning (3h)
- [ ] Task 4.3: Request tracing (2h)
- [ ] Task 4.4: Documentation (3h)

---

## 🎯 SUCCESS METRICS

After implementation, verify:
- [ ] No 500 errors in production
- [ ] Rate limit blocks suspicious traffic
- [ ] No SQL injection vulnerabilities
- [ ] All errors logged to Sentry
- [ ] Health check returns 200
- [ ] Response times < 500ms for 95th percentile
- [ ] All sensitive operations audited
- [ ] Security headers score A+ on securityheaders.com

---

## 📞 SUPPORT & ESCALATION

If issues arise during implementation:
1. Check error logs in Vercel
2. Review Sentry error reports
3. Check database query performance
4. Verify environment variables
5. Review rate limit analytics

**Estimated Total Implementation Time:** 96 hours (12 business days)
**Recommended Team Size:** 1-2 developers
**Deployment Window:** Weekend or low-traffic period
