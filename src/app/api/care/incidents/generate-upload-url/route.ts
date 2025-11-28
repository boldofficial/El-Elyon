// src/app/api/care/incidents/generate-upload-url/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {generateUploadUrl, generateFileKey} from '@/lib/aws-s3';

export async function POST(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {filename, contentType} = await request.json();

		if (!filename || !contentType) {
			return NextResponse.json(
				{error: 'filename and contentType are required'},
				{status: 400}
			);
		}

		// Validate file type
		const allowedTypes = [
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'image/jpeg',
			'image/jpg',
			'image/png',
		];

		if (!allowedTypes.includes(contentType)) {
			return NextResponse.json(
				{error: 'Invalid file type. Allowed: PDF, DOC, DOCX, JPEG, PNG'},
				{status: 400}
			);
		}

		const fileKey = generateFileKey('incident-attachments', filename);
		const uploadUrl = await generateUploadUrl(fileKey, contentType);

		return NextResponse.json({
			uploadUrl,
			fileKey,
		});
	} catch (error: any) {
		console.error('Error generating upload URL:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
