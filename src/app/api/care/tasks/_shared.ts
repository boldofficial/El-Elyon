// src/app/api/care/tasks/_shared.ts
//
// Helpers shared by the tasks routes. Not a route itself (Next.js only treats
// `route.ts` as one).

import {NextResponse} from 'next/server';
import {AccessDeniedError} from '@/lib/db-helpers';
import {TaskConflictError, TaskValidationError} from '@/db/mutations/tasks';

export const NO_STORE = {'Cache-Control': 'private, no-store'};

export function taskErrorResponse(error: unknown, fallback: string) {
	if (error instanceof AccessDeniedError) {
		return NextResponse.json({error: 'Access denied'}, {status: 403});
	}
	if (error instanceof TaskValidationError) {
		return NextResponse.json({error: error.message}, {status: 400});
	}
	if (error instanceof TaskConflictError) {
		return NextResponse.json({error: error.message}, {status: 409});
	}
	console.error(fallback, error instanceof Error ? error.message : error);
	return NextResponse.json({error: 'Internal server error'}, {status: 500});
}

/** Parses a JSON object body, or returns null for anything else. */
export async function readJsonObject(
	request: Request
): Promise<Record<string, unknown> | null> {
	try {
		const body = await request.json();
		return body && typeof body === 'object' && !Array.isArray(body)
			? (body as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}
