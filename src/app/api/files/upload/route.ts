// // src/app/api/files/upload/route.ts
// import {NextRequest, NextResponse} from 'next/server';
// import {auth} from '@clerk/nextjs/server';
// import {uploadFile, verifyUploadToken} from '@/lib/neon-storage';
// import {requireAdminOrSupervisorAccess} from '@/lib/db-helpers';

// export async function POST(req: NextRequest) {
// 	try {
// 		const {userId} = await auth();
// 		if (!userId) {
// 			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
// 		}

// 		// Check if user has permission to upload
// 		await requireAdminOrSupervisorAccess(userId);

// 		const formData = await req.formData();
// 		const file = formData.get('file') as File;
// 		const category = formData.get('category') as string;
// 		const metadata = formData.get('metadata') as string;

// 		if (!file) {
// 			return NextResponse.json({error: 'No file provided'}, {status: 400});
// 		}

// 		if (!category) {
// 			return NextResponse.json({error: 'Category is required'}, {status: 400});
// 		}

// 		// Validate file size (max 10MB for now, adjust as needed)
// 		const maxSize = 10 * 1024 * 1024; // 10MB
// 		if (file.size > maxSize) {
// 			return NextResponse.json(
// 				{error: `File size exceeds ${maxSize / 1024 / 1024}MB limit`},
// 				{status: 400}
// 			);
// 		}

// 		// Read file content
// 		const arrayBuffer = await file.arrayBuffer();
// 		const buffer = Buffer.from(arrayBuffer);

// 		// Upload to Neon storage
// 		const uploadedFile = await uploadFile({
// 			fileContent: buffer,
// 			fileName: file.name,
// 			contentType: file.type,
// 			uploadedBy: userId,
// 			category: category as any,
// 			metadata: metadata ? JSON.parse(metadata) : undefined,
// 		});

// 		return NextResponse.json({
// 			success: true,
// 			fileId: uploadedFile.id,
// 			fileName: uploadedFile.file_name,
// 			fileSize: uploadedFile.file_size,
// 			contentType: uploadedFile.content_type,
// 		});
// 	} catch (error: any) {
// 		console.error('Error uploading file:', error);
// 		return NextResponse.json({error: error.message}, {status: 500});
// 	}
// }
