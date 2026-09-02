import {
	WaterTemperatureConflictError,
	WaterTemperatureNotFoundError,
	WaterTemperatureShiftRequiredError,
} from '@/db/queries/water-temperature';
import {AccessDeniedError} from '@/lib/db-helpers';
import {createValidationErrorResponse} from '@/lib/validation-schemas';
import {NextResponse} from 'next/server';
import {ZodError, type ZodType} from 'zod';

const MAX_BODY_BYTES = 128 * 1024;

export class WaterTemperatureRequestError extends Error {
	constructor(message: string, readonly status: number) {
		super(message);
		this.name = 'WaterTemperatureRequestError';
	}
}

/** Strict JSON body parsing shared by every water-temperature route: rejects
 * a non-JSON content type, enforces a byte cap even for a chunked body with
 * no declared Content-Length (mirrors _life-safety-route.ts), then applies
 * the caller-supplied Zod contract. */
export async function parseWaterTemperatureJson<T>(
	request: Request,
	schema: ZodType<T>
): Promise<T> {
	const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim().toLowerCase();
	if (contentType !== 'application/json') {
		throw new WaterTemperatureRequestError('Content-Type must be application/json', 415);
	}
	const declaredLength = Number(request.headers.get('content-length') || 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
		throw new WaterTemperatureRequestError('Request body is too large', 413);
	}
	const text = request.body ? await readRequestTextWithLimit(request) : await request.text();
	let value: unknown;
	try {
		value = JSON.parse(text);
	} catch {
		throw new WaterTemperatureRequestError('Invalid JSON body', 400);
	}
	return schema.parse(value);
}

/** Every water-temperature response is private and non-cacheable (R18):
 * status, detail, month, and mutation responses must never enter a shared
 * browser/service-worker cache. */
export function waterTemperatureJson(data: unknown, init?: ResponseInit) {
	const response = NextResponse.json(data, init);
	response.headers.set('Cache-Control', 'private, no-store');
	return response;
}

export function waterTemperatureErrorResponse(error: unknown) {
	if (error instanceof ZodError) {
		return waterTemperatureJson(createValidationErrorResponse(error), {status: 400});
	}
	if (error instanceof WaterTemperatureRequestError) {
		return waterTemperatureJson({error: error.message}, {status: error.status});
	}
	if (error instanceof WaterTemperatureConflictError) {
		return waterTemperatureJson(
			{error: error.message, code: error.code, current: error.current},
			{status: 409}
		);
	}
	if (error instanceof WaterTemperatureShiftRequiredError) {
		return waterTemperatureJson(
			{error: error.message, code: 'NO_ACTIVE_SHIFT'},
			{status: 409}
		);
	}
	if (error instanceof WaterTemperatureNotFoundError) {
		return waterTemperatureJson({error: 'Not found'}, {status: 404});
	}
	// Typed, not substring-matched. `AccessDeniedError` covers both the shared
	// `require*Access` helpers and `WaterTemperatureAccessDeniedError`, which
	// extends it. A heuristic on error text (`message.includes('access')`) would
	// also catch unrelated internal failures such as "cannot access database
	// connection" and report a real outage as 403 Access denied instead of 500.
	if (error instanceof AccessDeniedError) {
		return waterTemperatureJson({error: 'Access denied'}, {status: 403});
	}
	console.error(
		'Water-temperature request failed',
		error instanceof Error ? error.message : 'Unknown error'
	);
	return waterTemperatureJson({error: 'Internal server error'}, {status: 500});
}

async function readRequestTextWithLimit(request: Request): Promise<string> {
	const reader = request.body!.getReader();
	const decoder = new TextDecoder();
	const chunks: string[] = [];
	let totalBytes = 0;

	try {
		while (true) {
			const {done, value} = await reader.read();
			if (done) break;
			if (!value) continue;
			totalBytes += value.byteLength;
			if (totalBytes > MAX_BODY_BYTES) {
				await reader.cancel().catch(() => undefined);
				throw new WaterTemperatureRequestError('Request body is too large', 413);
			}
			chunks.push(decoder.decode(value, {stream: true}));
		}
		chunks.push(decoder.decode());
		return chunks.join('');
	} finally {
		reader.releaseLock();
	}
}
