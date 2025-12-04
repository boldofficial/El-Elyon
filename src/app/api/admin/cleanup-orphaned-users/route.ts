import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {cleanupOrphanedUsers} from '@/db/mutations/cleanup';

/**
 * POST /api/admin/cleanup-orphaned-users
 * Deletes users with incomplete records (missing employee/role/user entries)
 * Also deletes their Clerk accounts and all related data
 * @returns Cleanup summary with deleted user details
 */
export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const result = await cleanupOrphanedUsers(userId);

		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error cleaning up orphaned users:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to clean up orphaned users'},
			{status: 500}
		);
	}
}
