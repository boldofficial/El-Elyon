// src/app/api/vacation-requests/route.ts
import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {getVacationRequests} from '@/db/queries/vacation-requests';
import {createVacationRequest} from '@/db/mutations/vacation-requests';
import {
	vacationRequestSchema,
	validateSchema,
	createValidationErrorResponse,
} from '@/lib/validation-schemas';
import {createErrorResponse} from '@/lib/error-handler';
import {logger} from '@/lib/logger';

// GET - List vacation requests
export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const searchParams = req.nextUrl.searchParams;
		const status = searchParams.get('status') as 'pending' | 'approved' | 'denied' | null;
		const limit = parseInt(searchParams.get('limit') || '100');

		logger.apiRequest('GET', '/api/vacation-requests', userId);

		const requests = await getVacationRequests({
			clerkUserId: userId,
			status: status || undefined,
			limit,
		});

		return NextResponse.json(requests);
	} catch (error: any) {
		logger.error('Error fetching vacation requests:', error);
		return createErrorResponse(error);
	}
}

// POST - Create vacation request
export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const body = await req.json();

		// Validate with Zod
		const validation = validateSchema(vacationRequestSchema, body);

		if (!validation.success) {
			return NextResponse.json(createValidationErrorResponse(validation.errors), {status: 400});
		}

		logger.apiRequest('POST', '/api/vacation-requests', userId);

		const newRequest = await createVacationRequest({
			clerkUserId: userId,
			startDate: new Date(validation.data.startDate),
			endDate: new Date(validation.data.endDate),
			reason: validation.data.reason,
		});

		return NextResponse.json(newRequest, {status: 201});
	} catch (error: any) {
		logger.error('Error creating vacation request:', error);
		return createErrorResponse(error);
	}
}
