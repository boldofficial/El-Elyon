import {clerkMiddleware} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import type {NextRequest} from 'next/server';
import {Ratelimit} from '@upstash/ratelimit';
import {Redis} from '@upstash/redis';

// Initialize rate limiter (optional - gracefully degrades if Redis not configured)
let ratelimit: Ratelimit | null = null;

if (
	process.env.KV_REST_API_URL &&
	process.env.KV_REST_API_TOKEN &&
	process.env.NODE_ENV === 'production'
) {
	const redis = new Redis({
		url: process.env.KV_REST_API_URL,
		token: process.env.KV_REST_API_TOKEN,
	});

	ratelimit = new Ratelimit({
		redis,
		limiter: Ratelimit.slidingWindow(20, '10 s'),
		analytics: true,
		prefix: '@upstash/ratelimit',
	});
}

// Clerk middleware with integrated rate limiting
export default clerkMiddleware(async (_auth, request: NextRequest) => {
	// Apply rate limiting to API routes (if configured)
	if (ratelimit && request.nextUrl.pathname.startsWith('/api')) {
		const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

		// Different limits for different route types
		let identifier = ip;

		if (request.nextUrl.pathname.startsWith('/api/auth')) {
			identifier = `auth:${ip}`;
		} else if (request.nextUrl.pathname.startsWith('/api/uploads')) {
			identifier = `upload:${ip}`;
		}

		try {
			const {success, limit: rateLimitMax, remaining, reset} = await ratelimit.limit(identifier);

			if (!success) {
				const response = NextResponse.json({error: 'Too many requests'}, {status: 429});
				response.headers.set('X-RateLimit-Limit', rateLimitMax.toString());
				response.headers.set('X-RateLimit-Remaining', remaining.toString());
				response.headers.set('X-RateLimit-Reset', new Date(reset).toISOString());
				return response;
			}
		} catch (error) {
			// If rate limiting fails, log error but allow request through
			console.error('Rate limiting error:', error);
		}
	}
});

export const config = {
	matcher: [
		// Skip Next.js internals and all static files, unless found in search params
		'/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
		// Always run for API routes
		'/(api|trpc)(.*)',
	],
};
