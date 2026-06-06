import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {replaceAdminPrivileges} from '@/db/mutations/admin-privileges';
import {normalizeAdminPrivileges} from '@/lib/admin-privileges';

export async function PUT(
	request: Request,
	{params}: {params: Promise<{clerkUserId: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {clerkUserId} = await params;
		if (!clerkUserId || clerkUserId === 'null') {
			return NextResponse.json(
				{error: 'Target user must have a linked account'},
				{status: 400}
			);
		}

		const body = await request.json();
		const result = await replaceAdminPrivileges({
			targetClerkUserId: clerkUserId,
			privileges: normalizeAdminPrivileges(body.privileges),
			actorClerkUserId: userId,
		});

		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error updating admin privileges:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
