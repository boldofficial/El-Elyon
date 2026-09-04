// src/app/api/care/incidents/download-url/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {generateDownloadUrl} from '@/lib/aws-s3';
import {requireSignatureStorageAccess} from '@/db/mutations/isp-signatures';
import {AccessDeniedError} from '@/lib/db-helpers';

export async function GET(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {searchParams} = new URL(request.url);
		const fileKey = searchParams.get('fileKey');

		if (!fileKey) {
			return NextResponse.json({error: 'fileKey is required'}, {status: 400});
		}

		// Generate presigned download URL (valid for 1 hour)
		if (fileKey.startsWith('isp-signatures/')) await requireSignatureStorageAccess(userId, fileKey);
		const downloadUrl = await generateDownloadUrl(fileKey, 3600);

		return NextResponse.json({downloadUrl});
	} catch (error: any) {
		if (error instanceof AccessDeniedError) return NextResponse.json({error: 'Access denied.'}, {status: 403});
		console.error('Error generating download URL:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
