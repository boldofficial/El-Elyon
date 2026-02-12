// src/app/api/vacation-requests/[id]/route.ts
import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {getVacationRequestById} from '@/db/queries/vacation-requests';
import {
	updateVacationRequestStatus,
	deleteVacationRequest,
} from '@/db/mutations/vacation-requests';
import {
	vacationRequestUpdateSchema,
	validateSchema,
	createValidationErrorResponse,
} from '@/lib/validation-schemas';
import {createErrorResponse} from '@/lib/error-handler';
import {logger} from '@/lib/logger';

// GET - Get single vacation request
export async function GET(
	req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const {id} = await params;
		logger.apiRequest('GET', `/api/vacation-requests/${id}`, userId);

		const request = await getVacationRequestById({
			clerkUserId: userId,
			requestId: id,
		});

		if (!request) {
			return NextResponse.json(
				{error: 'Vacation request not found'},
				{status: 404}
			);
		}

		return NextResponse.json(request);
	} catch (error: any) {
		logger.error('Error fetching vacation request:', error);
		return createErrorResponse(error);
	}
}

// PATCH - Update vacation request status (approve/deny)
export async function PATCH(
	req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const body = await req.json();

		// Validate with Zod
		const validation = validateSchema(vacationRequestUpdateSchema, body);

		if (!validation.success) {
			return NextResponse.json(createValidationErrorResponse(validation.errors), {status: 400});
		}

		const {id} = await params;
		logger.apiRequest('PATCH', `/api/vacation-requests/${id}`, userId);

		const updatedRequest = await updateVacationRequestStatus({
			clerkUserId: userId,
			requestId: id,
			status: validation.data.status,
			adminComments: validation.data.adminComments,
		});

		return NextResponse.json(updatedRequest);
	} catch (error: any) {
		logger.error('Error updating vacation request:', error);
		return createErrorResponse(error);
	}
}

// DELETE - Delete vacation request
export async function DELETE(
	req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const {id} = await params;
		logger.apiRequest('DELETE', `/api/vacation-requests/${id}`, userId);

		await deleteVacationRequest({
			clerkUserId: userId,
			requestId: id,
		});

		return NextResponse.json({success: true});
	} catch (error: any) {
		logger.error('Error deleting vacation request:', error);
		return createErrorResponse(error);
	}
}
