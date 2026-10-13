// src/app/api/staff-directory/home/route.ts
// One home: its roster (and, for admins, who can still be added). Home
// documents come from /api/staff-documents?location=… like any other list.

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {AccessDeniedError} from '@/lib/db-helpers';
import {requireStaffDocumentViewer} from '@/db/queries/staff-documents';
import {getDirectoryHome} from '@/db/queries/staff-directory';

const privateNoStore = {'Cache-Control': 'private, no-store'};

export async function GET(req: NextRequest) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const viewer = await requireStaffDocumentViewer(userId);
		const name = req.nextUrl.searchParams.get('name')?.trim();
		if (!name) {
			return NextResponse.json({error: 'Choose a home'}, {status: 400});
		}

		// Not found and not yours look the same, so ids can't be probed.
		const home = await getDirectoryHome(viewer, name);
		if (!home) {
			return NextResponse.json({error: 'Home not found'}, {status: 404});
		}
		return NextResponse.json({...home, canEdit: viewer.role === 'admin'}, {headers: privateNoStore});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff directory home error:', error);
		return NextResponse.json({error: 'Failed to load this home'}, {status: 500});
	}
}
