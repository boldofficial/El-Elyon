/**
 * Request Tracing Utilities
 * Provides correlation IDs for tracking requests across services
 */

import {NextRequest, NextResponse} from 'next/server';
import crypto from 'crypto';

export const TRACE_HEADER = 'x-trace-id';
export const REQUEST_ID_HEADER = 'x-request-id';

/**
 * Generates a unique trace ID
 */
export function generateTraceId(): string {
	return `trace_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Generates a unique request ID
 */
export function generateRequestId(): string {
	return `req_${crypto.randomBytes(12).toString('hex')}`;
}

/**
 * Extracts trace ID from request or generates a new one
 */
export function getOrCreateTraceId(req: NextRequest): string {
	return req.headers.get(TRACE_HEADER) || generateTraceId();
}

/**
 * Extracts request ID from request or generates a new one
 */
export function getOrCreateRequestId(req: NextRequest): string {
	return req.headers.get(REQUEST_ID_HEADER) || generateRequestId();
}

/**
 * Adds trace and request IDs to response headers
 */
export function addTraceHeaders(response: NextResponse, traceId: string, requestId: string): NextResponse {
	response.headers.set(TRACE_HEADER, traceId);
	response.headers.set(REQUEST_ID_HEADER, requestId);
	return response;
}

/**
 * Creates a traced response with correlation IDs
 */
export function createTracedResponse(data: any, req: NextRequest, status: number = 200): NextResponse {
	const traceId = getOrCreateTraceId(req);
	const requestId = getOrCreateRequestId(req);

	const response = NextResponse.json(data, {status});
	return addTraceHeaders(response, traceId, requestId);
}

/**
 * Middleware wrapper that adds tracing to API routes
 */
export function withTracing(handler: (req: NextRequest) => Promise<NextResponse>) {
	return async (req: NextRequest): Promise<NextResponse> => {
		const traceId = getOrCreateTraceId(req);
		const requestId = getOrCreateRequestId(req);

		// Store in AsyncLocalStorage for access in nested functions
		// (Alternative: pass as parameter)

		try {
			const response = await handler(req);
			return addTraceHeaders(response, traceId, requestId);
		} catch (error) {
			// Ensure error responses also have trace headers
			const errorResponse = NextResponse.json(
				{
					error: error instanceof Error ? error.message : 'Internal server error',
					traceId,
					requestId,
				},
				{status: 500}
			);
			return addTraceHeaders(errorResponse, traceId, requestId);
		}
	};
}

/**
 * Gets trace context from request for logging
 */
export function getTraceContext(req?: NextRequest): string {
	if (!req) return '';

	const traceId = getOrCreateTraceId(req);
	const requestId = getOrCreateRequestId(req);

	return `[trace=${traceId}] [req=${requestId}]`;
}
