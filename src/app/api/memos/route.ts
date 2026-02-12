// src/app/api/memos/route.ts
import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {getMemos} from '@/db/queries/memos';
import {createMemo} from '@/db/mutations/memos';
import {memoSchema, validateSchema, createValidationErrorResponse} from '@/lib/validation-schemas';
import {createErrorResponse} from '@/lib/error-handler';
import {logger} from '@/lib/logger';

// GET - List memos
export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const searchParams = req.nextUrl.searchParams;
		const limit = parseInt(searchParams.get('limit') || '50');
		const unreadOnly = searchParams.get('unreadOnly') === 'true';

		logger.apiRequest('GET', '/api/memos', userId);

		const results = await getMemos({
			clerkUserId: userId,
			limit,
			unreadOnly,
		});

		return NextResponse.json(results);
	} catch (error: any) {
		logger.error('Error fetching memos:', error);
		return createErrorResponse(error);
	}
}

// POST - Create memo
export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const body = await req.json();

		// Validate with Zod
		const validation = validateSchema(memoSchema, body);

		if (!validation.success) {
			return NextResponse.json(createValidationErrorResponse(validation.errors), {status: 400});
		}

		logger.apiRequest('POST', '/api/memos', userId);

		const newMemo = await createMemo({
			clerkUserId: userId,
			...validation.data,
			expiresAt: validation.data.expiresAt ? new Date(validation.data.expiresAt) : undefined,
		});

		return NextResponse.json(newMemo, {status: 201});
	} catch (error: any) {
		logger.error('Error creating memo:', error);
		return createErrorResponse(error);
	}
}
