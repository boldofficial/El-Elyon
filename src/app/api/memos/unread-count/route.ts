// src/app/api/memos/unread-count/route.ts
import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {internalServerError} from '@/lib/api-errors';
import {getUnreadMemoCount} from '@/db/queries/memos';

// GET - Get unread memo count
export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const count = await getUnreadMemoCount(userId);

		return NextResponse.json({count});
	} catch (error) {
		return internalServerError(error, 'GetUnreadMemoCount');
	}
}
