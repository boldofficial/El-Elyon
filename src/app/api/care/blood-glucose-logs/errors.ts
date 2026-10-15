// src/app/api/care/blood-glucose-logs/errors.ts
//
// Shared error-to-response mapping for the blood sugar log routes.

import {NextResponse} from 'next/server';
import {AccessDeniedError} from '@/lib/db-helpers';
import {
	GlucoseLogConflictError,
	GlucoseLogValidationError,
} from '@/db/mutations/blood-glucose-logs';

export const NO_STORE = {'Cache-Control': 'private, no-store'};

export function glucoseErrorResponse(error: unknown, fallback: string) {
	if (error instanceof AccessDeniedError) {
		return NextResponse.json({error: error.message}, {status: 403});
	}
	if (error instanceof GlucoseLogValidationError) {
		return NextResponse.json({error: error.message}, {status: 400});
	}
	if (error instanceof GlucoseLogConflictError) {
		return NextResponse.json({error: error.message}, {status: 409});
	}
	console.error(fallback, error instanceof Error ? error.message : error);
	return NextResponse.json({error: 'Internal server error'}, {status: 500});
}
