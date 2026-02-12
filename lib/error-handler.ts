/**
 * Error handling utilities for API routes
 * Provides sanitized error responses and consistent error formatting
 */

interface ErrorResponse {
	message: string;
	code: string;
	statusCode: number;
}

// Standard error codes and messages
const ERROR_CODES = {
	UNAUTHORIZED: {code: 'UNAUTHORIZED', message: 'Authentication required', status: 401},
	FORBIDDEN: {code: 'FORBIDDEN', message: 'Insufficient permissions', status: 403},
	NOT_FOUND: {code: 'NOT_FOUND', message: 'Resource not found', status: 404},
	VALIDATION_ERROR: {code: 'VALIDATION_ERROR', message: 'Validation failed', status: 400},
	RATE_LIMIT: {code: 'RATE_LIMIT', message: 'Too many requests', status: 429},
	INTERNAL_ERROR: {code: 'INTERNAL_ERROR', message: 'An error occurred', status: 500},
	BAD_REQUEST: {code: 'BAD_REQUEST', message: 'Invalid request', status: 400},
	CONFLICT: {code: 'CONFLICT', message: 'Resource already exists', status: 409},
} as const;

/**
 * Custom application error class
 * Use this to throw errors with specific error codes
 */
export class AppError extends Error {
	constructor(
		public code: keyof typeof ERROR_CODES,
		public details?: Record<string, any>
	) {
		super(ERROR_CODES[code].message);
		this.name = 'AppError';
	}
}

/**
 * Sanitizes errors before sending to client
 * Hides sensitive information in production
 * Logs full error details for debugging
 */
export function sanitizeError(error: unknown): ErrorResponse {
	// Log full error internally for debugging
	console.error('[Error Handler] Error occurred:', error);

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
		if (error.message.includes('Unauthorized') || error.message.includes('not authenticated')) {
			return {
				message: 'Authentication required',
				code: 'UNAUTHORIZED',
				statusCode: 401,
			};
		}

		// Permission errors
		if (
			error.message.includes('Forbidden') ||
			error.message.includes('access denied') ||
			error.message.includes('permission') ||
			error.message.includes('not authorized')
		) {
			return {
				message: 'Insufficient permissions',
				code: 'FORBIDDEN',
				statusCode: 403,
			};
		}

		// Not found errors
		if (error.message.includes('not found') || error.message.includes('does not exist')) {
			return {
				message: 'Resource not found',
				code: 'NOT_FOUND',
				statusCode: 404,
			};
		}

		// Conflict errors (duplicate entries)
		if (error.message.includes('already exists') || error.message.includes('duplicate')) {
			return {
				message: 'Resource already exists',
				code: 'CONFLICT',
				statusCode: 409,
			};
		}

		// Development mode - show actual error message
		if (process.env.NODE_ENV === 'development') {
			return {
				message: error.message,
				code: 'INTERNAL_ERROR',
				statusCode: 500,
			};
		}
	}

	// Production - hide implementation details
	return {
		message: 'An error occurred. Please try again later.',
		code: 'INTERNAL_ERROR',
		statusCode: 500,
	};
}

/**
 * Creates a standardized error Response object
 * Use this in API route catch blocks
 */
export function createErrorResponse(error: unknown): Response {
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

/**
 * Helper to throw a 401 Unauthorized error
 */
export function throwUnauthorized(): never {
	throw new AppError('UNAUTHORIZED');
}

/**
 * Helper to throw a 403 Forbidden error
 */
export function throwForbidden(): never {
	throw new AppError('FORBIDDEN');
}

/**
 * Helper to throw a 404 Not Found error
 */
export function throwNotFound(): never {
	throw new AppError('NOT_FOUND');
}

/**
 * Helper to throw a 400 Validation Error
 */
export function throwValidationError(details?: Record<string, any>): never {
	throw new AppError('VALIDATION_ERROR', details);
}

/**
 * Helper to throw a 409 Conflict error
 */
export function throwConflict(): never {
	throw new AppError('CONFLICT');
}
