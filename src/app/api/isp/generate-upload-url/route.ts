// // src/app/api/isp/generate-upload-url/route.ts
// import {NextRequest, NextResponse} from 'next/server';
// import {auth} from '@clerk/nextjs/server';
// import {requireAdminOrSupervisorAccess} from '@/lib/db-helpers';
// import {generateUploadUrl, generateFileKey} from '@/lib/aws-s3';

// export async function POST(req: NextRequest) {
// 	try {
// 		const {userId} = await auth();
// 		if (!userId) {
// 			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
// 		}

// 		await requireAdminOrSupervisorAccess(userId);

// 		const {filename, contentType} = await req.json();

// 		if (!filename || !contentType) {
// 			return NextResponse.json(

        
// 				{error: 'filename and contentType are required'},
// 				{status: 400}
// 			);
// 		}

// 		const fileKey = generateFileKey('isp-files', filename);
// 		const uploadUrl = await generateUploadUrl(fileKey, contentType);

// 		return NextResponse.json({
// 			uploadUrl,
// 			fileKey,
// 		});
// 	} catch (error: any) {
// 		console.error('Error generating upload URL:', error);
// 		return NextResponse.json({error: error.message}, {status: 500});
// 	}
// }

// // src/app/api/hr/generate-upload-url/route.ts
// import {NextRequest, NextResponse} from 'next/server';
// import {auth} from '@clerk/nextjs/server';
// import {requireAdminAccess} from '@/lib/db-helpers';
// import {generateUploadUrl, generateFileKey} from '@/lib/aws-s3';

// export async function POST(req: NextRequest) {
// 	try {
// 		const {userId} = await auth();
// 		if (!userId) {
// 			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
// 		}

// 		await requireAdminAccess(userId);

// 		const {filename, contentType, fileType} = await req.json();

// 		if (!filename || !contentType || !fileType) {
// 			return NextResponse.json(
// 				{error: 'filename, contentType, and fileType are required'},
// 				{status: 400}
// 			);
// 		}

// 		const fileKey = generateFileKey(`hr/${fileType}`, filename);
// 		const uploadUrl = await generateUploadUrl(fileKey, contentType);

// 		return NextResponse.json({
// 			uploadUrl,
// 			fileKey,
// 		});
// 	} catch (error: any) {
// 		console.error('Error generating upload URL:', error);
// 		return NextResponse.json({error: error.message}, {status: 500});
// 	}
// }
