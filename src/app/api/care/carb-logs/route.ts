// src/app/api/care/carb-logs/route.ts
//
// Per-meal carbohydrate log for residents with carb tracking enabled.
//   GET  ?residentId=&from=&to=          -> {entries, today}  (one resident)
//   GET  ?scope=days&location=&residentId=&from=&to=
//        -> {from, to, rows}  (oversight: one row per resident per day,
//           scoped to the caller's locations; admins see all)
//   POST {residentId, mealSlot, carbsGrams, foodDescription?, notes?, operationalDate?}

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {AccessDeniedError} from '@/lib/db-helpers';
import {
	getCarbLogDayStatus,
	getCarbLogsForResident,
	getCarbLogsForScope,
} from '@/db/queries/carb-logs';
import {
	CarbLogConflictError,
	CarbLogValidationError,
	createCarbLog,
} from '@/db/mutations/carb-logs';

const NO_STORE = {'Cache-Control': 'private, no-store'};
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function errorResponse(error: unknown, fallback: string) {
	if (error instanceof AccessDeniedError) {
		return NextResponse.json({error: 'Access denied'}, {status: 403});
	}
	if (error instanceof CarbLogValidationError) {
		return NextResponse.json({error: error.message}, {status: 400});
	}
	if (error instanceof CarbLogConflictError) {
		return NextResponse.json({error: error.message}, {status: 409});
	}
	console.error(fallback, error instanceof Error ? error.message : error);
	return NextResponse.json({error: 'Internal server error'}, {status: 500});
}

export async function GET(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	const {searchParams} = new URL(request.url);
	const residentId = searchParams.get('residentId');
	const from = searchParams.get('from');
	const to = searchParams.get('to');
	if ((from && !DATE_RE.test(from)) || (to && !DATE_RE.test(to))) {
		return NextResponse.json({error: 'Invalid date range'}, {status: 400});
	}

	// Oversight view: grouped resident-day rows across the caller's locations.
	// Handled by a separate, location-scoped query rather than by relaxing the
	// per-resident read below.
	if (searchParams.get('scope') === 'days') {
		try {
			const result = await getCarbLogsForScope(userId, {
				location: searchParams.get('location') ?? undefined,
				residentId: residentId ?? undefined,
				from: from ?? undefined,
				to: to ?? undefined,
			});
			return NextResponse.json(result, {headers: NO_STORE});
		} catch (error) {
			return errorResponse(error, 'Error fetching carb log summary:');
		}
	}

	if (!residentId) {
		return NextResponse.json({error: 'residentId is required'}, {status: 400});
	}

	try {
		const [entries, today] = await Promise.all([
			getCarbLogsForResident(userId, residentId, {
				from: from ?? undefined,
				to: to ?? undefined,
			}),
			getCarbLogDayStatus(userId, residentId),
		]);
		return NextResponse.json({entries, today}, {headers: NO_STORE});
	} catch (error) {
		return errorResponse(error, 'Error fetching carb logs:');
	}
}

export async function POST(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return NextResponse.json({error: 'Invalid JSON'}, {status: 400});
	}
	if (typeof body.residentId !== 'string' || !body.residentId) {
		return NextResponse.json({error: 'residentId is required'}, {status: 400});
	}

	try {
		const created = await createCarbLog(userId, {
			residentId: body.residentId,
			mealSlot: body.mealSlot,
			carbsGrams: body.carbsGrams,
			foodDescription: body.foodDescription,
			notes: body.notes,
			operationalDate: body.operationalDate,
		});
		return NextResponse.json(created, {status: 201, headers: NO_STORE});
	} catch (error) {
		return errorResponse(error, 'Error creating carb log:');
	}
}
