// src/app/api/uploads/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {writeFile, mkdir} from 'fs/promises';
import {join} from 'path';
import {existsSync} from 'fs';
import {logAudit} from '@/lib/db-helpers';

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

		// Generate unique filename
		const timestamp = Date.now();
		const randomString = Math.random().toString(36).substring(7);
		const extension = file.name.split('.').pop();
		const filename = `${fileType}_${timestamp}_${randomString}.${extension}`;

		// Ensure upload directory exists
		const uploadDir = join(process.cwd(), 'uploads', fileType || 'general');
		if (!existsSync(uploadDir)) {
			await mkdir(uploadDir, {recursive: true});
		}

		// Convert file to buffer and save
		const bytes = await file.arrayBuffer();
		const buffer = Buffer.from(bytes);
		const filepath = join(uploadDir, filename);

		await writeFile(filepath, buffer);

		// Log the upload
		await logAudit({
			clerkUserId: userId,
			event: 'FILE_UPLOAD',
			details: `Uploaded ${file.name} (${fileType})`,
			deviceId: 'system',
			location: '',
		});

		// Return file ID (filename) for storage in database
		return NextResponse.json({
			fileId: filename,
			fileName: file.name,
			fileSize: file.size,
			contentType: file.type,
			uploadedAt: new Date().toISOString(),
		});
	} catch (error: any) {
		console.error('Error uploading file:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// GET - Download file
export async function GET(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const {searchParams} = new URL(request.url);
		const fileId = searchParams.get('fileId');
		const fileType = searchParams.get('fileType');

		if (!fileId || !fileType) {
			return NextResponse.json(
				{error: 'Missing fileId or fileType'},
				{status: 400}
			);
		}

		const filepath = join(process.cwd(), 'uploads', fileType, fileId);

		if (!existsSync(filepath)) {
			return NextResponse.json({error: 'File not found'}, {status: 404});
		}

		// Read file and return
		const {readFile} = await import('fs/promises');
		const fileBuffer = await readFile(filepath);

		// Determine content type from extension
		const ext = fileId.split('.').pop();
		const contentTypeMap: Record<string, string> = {
			pdf: 'application/pdf',
			doc: 'application/msword',
			docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			jpg: 'image/jpeg',
			jpeg: 'image/jpeg',
			png: 'image/png',
		};

		const contentType = contentTypeMap[ext || ''] || 'application/octet-stream';

		return new NextResponse(fileBuffer, {
			headers: {
				'Content-Type': contentType,
				'Content-Disposition': `attachment; filename="${fileId}"`,
			},
		});
	} catch (error: any) {
		console.error('Error downloading file:', error);
		return NextResponse.json({error: error.message}, {status: 500});
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
		const fileId = searchParams.get('fileId');
		const fileType = searchParams.get('fileType');

		if (!fileId || !fileType) {
			return NextResponse.json(
				{error: 'Missing fileId or fileType'},
				{status: 400}
			);
		}

		const filepath = join(process.cwd(), 'uploads', fileType, fileId);

		if (!existsSync(filepath)) {
			return NextResponse.json({error: 'File not found'}, {status: 404});
		}

		// Delete the file
		const {unlink} = await import('fs/promises');
		await unlink(filepath);

		// Log the deletion
		await logAudit({
			clerkUserId: userId,
			event: 'FILE_DELETE',
			details: `Deleted file ${fileId} (${fileType})`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json({success: true, message: 'File deleted'});
	} catch (error: any) {
		console.error('Error deleting file:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
