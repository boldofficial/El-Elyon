// src/app/api/inspector/download/route.ts
//
// Streams a document to the inspector via a presigned S3 URL, but only if the
// requested file key belongs to the inspector's location (ISP files, fire-evac
// plans, incident attachments). Prevents access to arbitrary S3 keys.

import {NextResponse} from 'next/server';
import {getInspectorSession} from '@/lib/inspector-auth';
import {getInspectorAllowedFileIds} from '@/db/queries/inspector';
import {generateDownloadUrl} from '@/lib/aws-s3';
import {logAudit} from '@/lib/db-helpers';

export async function GET(req: Request) {
	const session = await getInspectorSession(req);
	if (!session) {
		return NextResponse.json({error: 'No active session'}, {status: 401});
	}

	const {searchParams} = new URL(req.url);
	const fileId = searchParams.get('fileId');
	if (!fileId) {
		return NextResponse.json({error: 'Missing fileId'}, {status: 400});
	}

	const allowed = await getInspectorAllowedFileIds(session.location);
	if (!allowed.has(fileId)) {
		return NextResponse.json({error: 'Not found'}, {status: 404});
	}

	try {
		const url = await generateDownloadUrl(fileId);
		await logAudit({
			clerkUserId: null,
			event: 'inspector.download',
			details: `Inspector downloaded ${fileId} (access ${session.accessId})`,
			deviceId: 'inspector',
			location: session.location,
		});
		return NextResponse.redirect(url);
	} catch (error: any) {
		console.error('Inspector download error:', error);
		return NextResponse.json({error: 'Download failed'}, {status: 500});
	}
}
