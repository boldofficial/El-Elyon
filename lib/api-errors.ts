/**
 * Safe API Error Handling Utilities
 * Prevents leaking internal error details to clients
 */

import {NextResponse} from 'next/server';

/**
 * Returns a generic 500 error response without exposing internal details
 * Logs the actual error server-side for debugging
 */
export function internalServerError(error: unknown, context?: string): NextResponse {
	// Log full error details server-side
	console.error(`${context ? `[${context}] ` : ''}Internal server error:`, error);
	
	// Return generic message to client
	return NextResponse.json(
		{error: 'Internal server error'},
		{status: 500}
	);
}

/**
 * Returns a safe error response, logging the full error server-side
 * Use this for any catch block in API routes
 */
export function safeError(error: unknown, statusCode: number = 500, context?: string): NextResponse {
	console.error(`${context ? `[${context}] ` : ''}Error:`, error);
	
	// For known error types, return safe message
	if (error instanceof Error) {
		// Only expose these specific expected error messages
		const safeMessages = [
			'Not authenticated',
			'Unauthorized',
			'Not found',
			'Invalid input',
			'Forbidden',
			'Too many requests',
			'Bad request',
		];
		
		if (safeMessages.some(msg => error.message.toLowerCase().includes(msg.toLowerCase()))) {
			return NextResponse.json({error: error.message}, {status: statusCode});
		}
	}
	
	// Default to generic message
	return NextResponse.json(
		{error: statusCode === 500 ? 'Internal server error' : 'Request failed'},
		{status: statusCode}
	);
}
