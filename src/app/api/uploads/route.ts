// src/app/api/uploads/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {logAudit} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {
	uploadFile,
	generateFileKey,
	generateDownloadUrl,
	deleteFile,
} from '@/lib/aws-s3';

// POST - Upload file
export async function POST(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const formData = await request.formData();
		const file = formData.get('file') as File;
		const fileType = formData.get('fileType') as string; // 'hr_doc', 'incident_attachment', etc.

		if (!file) {
			return NextResponse.json({error: 'No file provided'}, {status: 400});
		}

		// Validate file size (10MB max)
		if (file.size > 10 * 1024 * 1024) {
			return NextResponse.json(
				{error: 'File size exceeds 10MB limit'},
				{status: 400}
			);
		}

		// Validate file type
		const allowedTypes = [
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'image/jpeg',
			'image/png',
			'image/jpg',
		];

		if (!allowedTypes.includes(file.type)) {
			return NextResponse.json(
				{error: 'Invalid file type. Allowed: PDF, DOC, DOCX, JPEG, PNG'},
				{status: 400}
			);
		}

		// Generate unique key for S3
		const fileKey = generateFileKey(fileType || 'general', file.name);

		// Convert file to buffer
		const bytes = await file.arrayBuffer();
		const buffer = Buffer.from(bytes);

		// Upload to S3
		await uploadFile(fileKey, buffer, file.type);

		// Log the upload
		await logAudit({
			clerkUserId: userId,
			event: 'FILE_UPLOAD',
			details: `Uploaded ${file.name} (${fileType}) to S3`,
			deviceId: 'system',
			location: '',
		});

		// Return file ID (key) for storage in database
		// NOTE: We return the fileKey as the fileId
		return NextResponse.json({
			fileId: fileKey,
			fileName: file.name,
			fileSize: file.size,
			contentType: file.type,
			uploadedAt: new Date().toISOString(),
		});
	} catch (error) {
		return internalServerError(error, 'UploadFile');
	}
}

// GET - Download file (Redirect to Presigned URL)
export async function GET(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const {searchParams} = new URL(request.url);
		const fileId = searchParams.get('fileId'); // This is the S3 Key
		// fileType might be passed but is part of the key now, so strictly not needed for lookup if fileId is the full key.
		// However, legacy usage or if fileId was just filename would need it.
		// Our new POST returns full key as fileId.

		if (!fileId) {
			return NextResponse.json({error: 'Missing fileId'}, {status: 400});
		}

		// Generate presigned URL
		const url = await generateDownloadUrl(fileId);

		// Redirect the user to the presigned URL
		return NextResponse.redirect(url);
	} catch (error) {
		return internalServerError(error, 'GetFileURL');
	}
}

// DELETE - Delete file
export async function DELETE(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const {searchParams} = new URL(request.url);
		const fileId = searchParams.get('fileId'); // S3 Key

		if (!fileId) {
			return NextResponse.json({error: 'Missing fileId'}, {status: 400});
		}

		// Delete from S3
		await deleteFile(fileId);

		// Log the deletion
		await logAudit({
			clerkUserId: userId,
			event: 'FILE_DELETE',
			details: `Deleted file ${fileId}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json({success: true, message: 'File deleted'});
	} catch (error) {
		return internalServerError(error, 'DeleteFile');
	}
}
