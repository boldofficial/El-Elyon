// src/app/api/admin/inspector-access/[id]/revoke/route.ts
// Admin: revoke an inspector-access grant immediately.

import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {revokeInspectorAccess} from '@/db/mutations/inspector';

export async function POST(
	_req: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) return NextResponse.json({error: 'Unauthorized'}, {status: 401});

	try {
		await requireAdminAccess(userId);
		const {id} = await params;
		const updated = await revokeInspectorAccess(id, userId);
		return NextResponse.json({success: true, id: updated?.id});
	} catch (error: any) {
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
