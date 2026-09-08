import {clerkMiddleware, createRouteMatcher} from '@clerk/nextjs/server';
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

// Any route under /api. Page routes are deliberately NOT covered - they render
// their own signed-out UI (e.g. `/` and `/kiosk` show a sign-in form) and must
// stay reachable without a Clerk session.
const isApiRoute = createRouteMatcher(['/api/(.*)']);

// Public API allowlist: endpoints that must work WITHOUT a Clerk session
// because they carry their own non-Clerk guard (or are intentionally open).
// Adding a route here removes it from the middleware safety net, so only do it
// when the route enforces its own authentication.
//   - /api/inspector/*        signed httpOnly `inspector_session` cookie
//                             (lib/inspector-auth.ts) - inspectors have no
//                             Clerk accounts at all
//   - /api/cron/*             CRON_SECRET bearer header (Vercel cron)
//   - /api/internal/*         INTERNAL_API_KEY header (server-to-server)
//   - /api/auth/webhook       Svix signature (Clerk webhook)
//   - guardian checklist      signed guardian link token, no Clerk account
//   - /api/kiosk/complete-pairing  device pairing happens before any sign-in
//   - /api/health             health check
//   - /api/admin/has-admin    first-run bootstrap, must work before any admin
//   - /api/care/log-templates static form definitions, no DB access, no PHI
const isPublicApiRoute = createRouteMatcher([
	'/api/inspector/(.*)',
	'/api/cron/(.*)',
	'/api/internal/(.*)',
	'/api/auth/webhook',
	'/api/guardian-checklists/by-token',
	'/api/guardian-checklists/submit',
	'/api/kiosk/complete-pairing',
	'/api/health',
	'/api/admin/has-admin',
	'/api/care/log-templates',
]);

// Clerk middleware with integrated rate limiting
export default clerkMiddleware(async (auth, request: NextRequest) => {
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

	// Deny-by-default safety net for API routes.
	//
	// This only guarantees that SOME authenticated Clerk user is present; it is
	// NOT the authorization model. Per-route `requireAuth()` / `requireRole()`
	// checks (lib/auth.ts) still do all fine-grained role and ownership
	// authorization and must stay in place. The point of this block is that a
	// new route which forgets its own check fails closed instead of being
	// silently public.
	//
	// A 401 JSON body is returned rather than a sign-in redirect: these are
	// fetch() callers, and a redirect would be useless to them.
	if (isApiRoute(request) && !isPublicApiRoute(request)) {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
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
