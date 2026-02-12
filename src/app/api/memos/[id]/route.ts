// src/app/api/memos/[id]/route.ts
import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {internalServerError} from '@/lib/api-errors';
import {getMemoById} from '@/db/queries/memos';
import {markMemoAsRead, deleteMemo} from '@/db/mutations/memos';

// GET - Get single memo
export async function GET(
	req: NextRequest,
	context: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const params = await context.params;
		const memo = await getMemoById({
			clerkUserId: userId,
			memoId: params.id,
		});

		if (!memo) {
			return NextResponse.json({error: 'Memo not found'}, {status: 404});
		}

		return NextResponse.json(memo);
	} catch (error) {
		return internalServerError(error, 'GetMemo');
	}
}

// PATCH - Mark memo as read
export async function PATCH(
	req: NextRequest,
	context: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const params = await context.params;
		const result = await markMemoAsRead({
			clerkUserId: userId,
			memoId: params.id,
		});

		return NextResponse.json(result);
	} catch (error) {
		return internalServerError(error, 'MarkMemoAsRead');
	}
}

// DELETE - Delete memo
export async function DELETE(
	req: NextRequest,
	context: {params: Promise<{id: string}>}
) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const params = await context.params;
		const result = await deleteMemo({
			clerkUserId: userId,
			memoId: params.id,
		});

		return NextResponse.json(result);
	} catch (error) {
		return internalServerError(error, 'DeleteMemo');
	}
}
