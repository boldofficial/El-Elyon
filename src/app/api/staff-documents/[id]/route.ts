// src/app/api/staff-documents/[id]/route.ts
// DELETE archives a staff document (admins only). The row and the S3 object
// are kept: these are personnel records, and an accidental removal should be
// recoverable from the database rather than gone.

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {and, eq, isNull} from 'drizzle-orm';
import {db} from '@/db/index';
import {staffDocuments} from '@/db/schema';
import {AccessDeniedError, logAudit, requireAdminAccess} from '@/lib/db-helpers';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
	_req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);
		const {id} = await params;
		if (!UUID_PATTERN.test(id)) {
			return NextResponse.json({error: 'Document not found'}, {status: 404});
		}

		const [archived] = await db
			.update(staffDocuments)
			.set({archivedAt: new Date(), archivedBy: userId})
			.where(and(eq(staffDocuments.id, id), isNull(staffDocuments.archivedAt)))
			.returning({id: staffDocuments.id, title: staffDocuments.title});

		if (!archived) {
			return NextResponse.json({error: 'Document not found'}, {status: 404});
		}

		await logAudit({
			clerkUserId: userId,
			event: 'staff_document.archived',
			details: `id=${archived.id},title=${archived.title}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json({success: true});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff document archive error:', error);
		return NextResponse.json({error: 'Failed to remove document'}, {status: 500});
	}
}
