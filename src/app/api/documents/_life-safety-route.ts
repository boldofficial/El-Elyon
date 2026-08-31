import {LifeSafetyConflictError, LifeSafetyNotFoundError} from '@/db/queries/life-safety';
import {NextResponse} from 'next/server';
import {ZodError, type ZodType} from 'zod';

const MAX_BODY_BYTES = 128 * 1024;

export class LifeSafetyRequestError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
		this.name = 'LifeSafetyRequestError';
	}
}

export async function parseLifeSafetyJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (contentType !== 'application/json') {
		throw new LifeSafetyRequestError('Content-Type must be application/json', 415);
	}
	const declaredLength = Number(request.headers.get('content-length') || 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
		throw new LifeSafetyRequestError('Request body is too large', 413);
	}
	const text = await request.text();
	if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
		throw new LifeSafetyRequestError('Request body is too large', 413);
	}
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new LifeSafetyRequestError('Invalid JSON body', 400);
	}
	return schema.parse(value);
}

export function lifeSafetyJson(data: unknown, init?: ResponseInit) {
	const response = NextResponse.json(data, init);
	response.headers.set('Cache-Control', 'private, no-store');
	return response;
}

export function lifeSafetyErrorResponse(error: unknown) {
	if (error instanceof ZodError) {
		return lifeSafetyJson(
			{error: 'Validation failed', fields: Object.fromEntries(error.issues.map((issue) => [issue.path.join('.'), issue.message]))},
			{status: 400}
		);
	}
	if (error instanceof LifeSafetyRequestError) {
		return lifeSafetyJson({error: error.message}, {status: error.status});
	}
	if (error instanceof LifeSafetyConflictError) {
		return lifeSafetyJson({error: error.message, code: 'VERSION_CONFLICT'}, {status: 409});
	}
	if (error instanceof LifeSafetyNotFoundError) {
		return lifeSafetyJson({error: 'Not found'}, {status: 404});
	}
	if (error instanceof Error && error.message.toLowerCase().includes('access')) {
		return lifeSafetyJson({error: 'Access denied'}, {status: 403});
	}
	console.error('Life-safety request failed', error instanceof Error ? error.message : 'Unknown error');
	return lifeSafetyJson({error: 'Internal server error'}, {status: 500});
}

export function legacyWriteDenied() {
	return lifeSafetyJson(
		{error: 'Legacy life-safety records are read-only', code: 'LEGACY_READ_ONLY'},
		{status: 405, headers: {Allow: 'GET'}}
	);
}
