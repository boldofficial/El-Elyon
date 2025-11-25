import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {cleanupOrphanedUsers} from '@/db/mutations/cleanup';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const result = await cleanupOrphanedUsers(userId);
		return NextResponse.json(result, {status: 200});
	} catch (error: any) {
		console.error('Error cleaning up orphaned users:', error);
		return new NextResponse(error.message, {status: 500});
	}
}
