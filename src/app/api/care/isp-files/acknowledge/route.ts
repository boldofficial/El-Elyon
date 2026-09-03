// src/app/api/care/isp-files/acknowledge/route.ts
//
// Records the current user's acknowledgment (read receipt) of an active ISP file.

import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {acknowledgeISPFile} from '@/db/mutations/isp';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		await requireCareAccess(userId);

		const {ispFileId} = await req.json();
		if (!ispFileId) {
			return NextResponse.json(
				{error: 'ispFileId is required'},
				{status: 400}
			);
		}

		const result = await acknowledgeISPFile(userId, ispFileId);
		return NextResponse.json(result);
	} catch (error: any) {
		console.error('Error acknowledging ISP file:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
