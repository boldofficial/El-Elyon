// src/app/api/care/carb-logs/[id]/route.ts
//
// PATCH {carbsGrams?, foodDescription?, notes?} -- author within 24h, or any
// supervisor/admin at the resident's location.

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {AccessDeniedError} from '@/lib/db-helpers';
import {CarbLogValidationError, updateCarbLog} from '@/db/mutations/carb-logs';

export async function PATCH(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
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

	try {
		const {id} = await params;
		const updated = await updateCarbLog(userId, id, {
			carbsGrams: body.carbsGrams,
			foodDescription: body.foodDescription,
			notes: body.notes,
		});
		return NextResponse.json(updated, {
			headers: {'Cache-Control': 'private, no-store'},
		});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		if (error instanceof CarbLogValidationError) {
			return NextResponse.json({error: error.message}, {status: 400});
		}
		console.error(
			'Error updating carb log:',
			error instanceof Error ? error.message : error
		);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
