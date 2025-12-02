// src/app/api/guardian-checklists/links/[id]/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {getChecklistLink} from '@/db/queries/guardian-checklists';
import {cancelChecklistLink} from '@/db/mutations/guardian-checklists';

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
		const link = await getChecklistLink(userId, id);
		return NextResponse.json(link);
	} catch (error: any) {
		console.error('Error getting link:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

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
		await cancelChecklistLink(userId, id);
		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('Error canceling link:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
