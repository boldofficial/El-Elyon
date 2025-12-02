// src/app/api/hr/download-url/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess} from '@/lib/db-helpers';
import {generateDownloadUrl} from '@/lib/aws-s3';

export async function GET(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const {searchParams} = new URL(request.url);
		const fileKey = searchParams.get('fileKey');

		if (!fileKey) {
			return NextResponse.json({error: 'fileKey is required'}, {status: 400});
		}

		// Generate presigned download URL (valid for 1 hour)
		const downloadUrl = await generateDownloadUrl(fileKey, 3600);

		return NextResponse.json({downloadUrl});
	} catch (error: any) {
		console.error('Error generating download URL:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
