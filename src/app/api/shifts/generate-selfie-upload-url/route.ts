// src/app/api/shifts/generate-selfie-upload-url/route.ts

import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {generateSelfieUploadUrl} from '@/db/mutations/care';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const uploadUrl = await generateSelfieUploadUrl();
		return NextResponse.json(uploadUrl, {status: 200});
	} catch (error: any) {
		console.error('Error generating selfie upload URL:', error);
		return new NextResponse(error.message, {status: 500});
	}
}
