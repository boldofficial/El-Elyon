/**
 * Middleware utilities for API routes
 * Provides request validation, body size limits, and error handling helpers
 */

import {NextRequest, NextResponse} from 'next/server';

// Maximum body sizes
export const MAX_BODY_SIZE = 1024 * 1024; // 1MB for regular API requests
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for file uploads

interface ValidationError {
	error: string;
	maxSize: string;
	receivedSize?: string;
}

/**
 * Validates the request body size against a maximum allowed size
 * @param request - The Next.js request object
 * @param maxSize - Maximum allowed size in bytes (default: MAX_BODY_SIZE)
 * @returns NextResponse with 413 error if body is too large, null if valid
 */
export function validateBodySize(
	request: NextRequest,
	maxSize: number = MAX_BODY_SIZE
): NextResponse<ValidationError> | null {
	const contentLength = request.headers.get('content-length');

	if (!contentLength) {
		// If no content-length header, let it through (will be handled by Next.js)
		return null;
	}

	const bodySize = parseInt(contentLength, 10);

	if (isNaN(bodySize)) {
		return NextResponse.json(
			{
				error: 'Invalid Content-Length header',
				maxSize: formatBytes(maxSize),
			},
			{status: 400}
		);
	}

	if (bodySize > maxSize) {
		return NextResponse.json(
			{
				error: 'Request body too large',
				maxSize: formatBytes(maxSize),
				receivedSize: formatBytes(bodySize),
			},
			{status: 413}
		);
	}

	return null;
}

/**
 * Validates a file upload request
 * Checks body size against MAX_FILE_SIZE
 */
export function validateFileUpload(
	request: NextRequest
): NextResponse<ValidationError> | null {
	return validateBodySize(request, MAX_FILE_SIZE);
}

/**
 * Wrapper for API route handlers that includes body size validation
 * @param handler - The API route handler function
 * @param maxSize - Maximum allowed body size (optional)
 */
export function withBodySizeValidation(
	handler: (request: NextRequest) => Promise<NextResponse>,
	maxSize?: number
) {
	return async (request: NextRequest): Promise<NextResponse> => {
		// Validate body size
		const validationError = validateBodySize(request, maxSize);
		if (validationError) {
			return validationError;
		}

		// Call the original handler
		return handler(request);
	};
}

/**
 * Wrapper for file upload handlers that includes file size validation
 */
export function withFileUploadValidation(
	handler: (request: NextRequest) => Promise<NextResponse>
) {
	return withBodySizeValidation(handler, MAX_FILE_SIZE);
}

/**
 * Formats bytes into human-readable string
 */
function formatBytes(bytes: number): string {
	if (bytes === 0) return '0 Bytes';

	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));

	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Creates a standardized error response for API routes
 */
export function errorResponse(
	message: string,
	status: number = 500,
	details?: Record<string, unknown>
): NextResponse {
	return NextResponse.json(
		{
			error: message,
			...(details && {details}),
		},
		{status}
	);
}

/**
 * Creates a standardized success response for API routes
 */
export function successResponse<T = unknown>(
	data: T,
	status: number = 200
): NextResponse {
	return NextResponse.json(data, {status});
}
