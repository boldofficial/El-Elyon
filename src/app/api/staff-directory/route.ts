// src/app/api/staff-directory/route.ts
// Staff Directory landing: the homes this viewer can open. Admins see every
// home; supervisors holding view_staff_documents see their own.

import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {AccessDeniedError} from '@/lib/db-helpers';
import {requireStaffDocumentViewer} from '@/db/queries/staff-documents';
import {listDirectoryHomes} from '@/db/queries/staff-directory';

const privateNoStore = {'Cache-Control': 'private, no-store'};

export async function GET() {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const viewer = await requireStaffDocumentViewer(userId);
		const homes = await listDirectoryHomes(viewer);
		return NextResponse.json({homes, canEdit: viewer.role === 'admin'}, {headers: privateNoStore});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff directory error:', error);
		return NextResponse.json({error: 'Failed to load the staff directory'}, {status: 500});
	}
}
