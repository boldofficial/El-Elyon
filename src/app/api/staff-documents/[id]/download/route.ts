// src/app/api/staff-documents/[id]/download/route.ts
// Every staff document download goes through here, never /api/uploads:
// this route re-checks the privilege and location scope per request and
// audit-logs who pulled which document, so the facility can answer "who
// downloaded this background check" after an inspection.

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {AccessDeniedError, logAudit} from '@/lib/db-helpers';
import {generateDownloadUrl} from '@/lib/aws-s3';
import {
	documentAuditLocation,
	getVisibleStaffDocument,
	requireStaffDocumentViewer,
} from '@/db/queries/staff-documents';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Short-lived: the link is only for the redirect that follows immediately.
const DOWNLOAD_URL_TTL_SECONDS = 60;

export async function GET(
	_req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const viewer = await requireStaffDocumentViewer(userId);
		const {id} = await params;

		const document = UUID_PATTERN.test(id)
			? await getVisibleStaffDocument(viewer, id)
			: null;
		if (!document) {
			await logAudit({
				clerkUserId: userId,
				event: 'access_denied',
				details: `staff_document_download_${id}`,
				deviceId: 'system',
				location: '',
			});
			return NextResponse.json({error: 'Document not found'}, {status: 404});
		}

		const url = await generateDownloadUrl(
			document.fileStorageId,
			DOWNLOAD_URL_TTL_SECONDS
		);

		await logAudit({
			clerkUserId: userId,
			event: 'staff_document.downloaded',
			details: `id=${document.id},title=${document.title}`,
			deviceId: 'system',
			location: documentAuditLocation(document),
		});

		return NextResponse.redirect(url, {headers: {'Cache-Control': 'private, no-store'}});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff document download error:', error);
		return NextResponse.json({error: 'Download failed'}, {status: 500});
	}
}
