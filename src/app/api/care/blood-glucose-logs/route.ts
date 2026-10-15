// src/app/api/care/blood-glucose-logs/route.ts
//
// Blood sugar log for residents with glucose tracking turned on.
//   GET  ?residentId=&from=&to=
//        -> {entries, today, settings, pendingRechecks, viewer}  (one resident)
//   GET  ?scope=list&location=&residentId=&from=&to=&show=all|attention|unreviewed
//        -> {from, to, entries, truncated, canReview}  (oversight across the
//           caller's locations; admins see all)
//   POST {residentId, checkedAt?, checkType, method, refused?, refusalReason?,
//         readingValue?, readingUnit?, symptoms?, actionsTaken?, notifiedWho?,
//         insulinGiven?, insulinType?, insulinUnits?, notes?, recheckOfId?}

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {
	getGlucoseLogsForScope,
	getGlucoseResidentView,
	type GlucoseScopeFilters,
} from '@/db/queries/blood-glucose-logs';
import {createGlucoseLog} from '@/db/mutations/blood-glucose-logs';
import {NO_STORE, glucoseErrorResponse} from './errors';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHOW_OPTIONS = new Set(['all', 'attention', 'unreviewed']);

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

	if (searchParams.get('scope') === 'list') {
		const show = searchParams.get('show') ?? 'all';
		if (!SHOW_OPTIONS.has(show)) {
			return NextResponse.json({error: 'Invalid filter'}, {status: 400});
		}
		try {
			const result = await getGlucoseLogsForScope(userId, {
				location: searchParams.get('location') ?? undefined,
				residentId: residentId ?? undefined,
				from: from ?? undefined,
				to: to ?? undefined,
				show: show as GlucoseScopeFilters['show'],
			});
			return NextResponse.json(result, {headers: NO_STORE});
		} catch (error) {
			return glucoseErrorResponse(error, 'Error fetching blood sugar overview:');
		}
	}

	if (!residentId) {
		return NextResponse.json({error: 'residentId is required'}, {status: 400});
	}

	try {
		const view = await getGlucoseResidentView(userId, residentId, {
			from: from ?? undefined,
			to: to ?? undefined,
		});
		return NextResponse.json(view, {headers: NO_STORE});
	} catch (error) {
		return glucoseErrorResponse(error, 'Error fetching blood sugar log:');
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
		const created = await createGlucoseLog(userId, {
			...body,
			residentId: body.residentId,
		});
		return NextResponse.json(created, {status: 201, headers: NO_STORE});
	} catch (error) {
		return glucoseErrorResponse(error, 'Error creating blood sugar log:');
	}
}
