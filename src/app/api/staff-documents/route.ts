// src/app/api/staff-documents/route.ts
// Staff documents for state inspectors. GET lists what the caller may see
// (admin: everything; supervisor with view_staff_documents or
// manage_staff_directory: own locations). POST uploads a document — admins,
// or supervisors with manage_staff_directory filing at their own homes.

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/db/index';
import {employees, locations, staffDocuments} from '@/db/schema';
import {AccessDeniedError, logAudit} from '@/lib/db-helpers';
import {generateFileKey, uploadFile} from '@/lib/aws-s3';
import {
	STAFF_DOCUMENT_CATEGORY_LABELS,
	STAFF_DOCUMENT_CONTENT_TYPES,
	STAFF_DOCUMENT_MAX_BYTES,
	canViewStaffDocument,
	resolveStaffDocumentTarget,
} from '@/lib/staff-documents';
import {
	getRosterHomesByEmployee,
	listStaffDocumentFilterOptions,
	listVisibleStaffDocuments,
	requireStaffDirectoryManager,
	requireStaffDocumentViewer,
} from '@/db/queries/staff-documents';

const privateNoStore = {'Cache-Control': 'private, no-store'};
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const viewer = await requireStaffDocumentViewer(userId);

		const employeeId = req.nextUrl.searchParams.get('employeeId') || undefined;
		if (employeeId && !UUID_PATTERN.test(employeeId)) {
			return NextResponse.json({error: 'Invalid employee'}, {status: 400});
		}

		const location = req.nextUrl.searchParams.get('location') || undefined;

		const [documents, options] = await Promise.all([
			listVisibleStaffDocuments(viewer, {employeeId, location}),
			listStaffDocumentFilterOptions(viewer),
		]);

		return NextResponse.json(
			{documents, ...options, canUpload: viewer.canManage, allHomes: viewer.role === 'admin'},
			{headers: privateNoStore}
		);
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff documents list error:', error);
		return NextResponse.json({error: 'Failed to load staff documents'}, {status: 500});
	}
}

export async function POST(req: NextRequest) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const viewer = await requireStaffDirectoryManager(userId);

		const form = await req.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			return NextResponse.json({error: 'Choose a file to upload'}, {status: 400});
		}
		if (file.size > STAFF_DOCUMENT_MAX_BYTES) {
			return NextResponse.json({error: 'File is larger than 4 MB. Split or compress the scan and try again.'}, {status: 400});
		}
		if (!(STAFF_DOCUMENT_CONTENT_TYPES as readonly string[]).includes(file.type)) {
			return NextResponse.json(
				{error: 'Upload a PDF, Word, Excel, CSV, JPEG or PNG file'},
				{status: 400}
			);
		}

		const target = resolveStaffDocumentTarget({
			category: form.get('category'),
			employeeId: form.get('employeeId'),
			location: form.get('location'),
		});
		if (!target.ok) {
			return NextResponse.json({error: target.error}, {status: 400});
		}

		// A typo'd location would file the document somewhere no supervisor
		// can see it, so both targets must exist. A supervisor may only file
		// what they could then see; outside their homes reads as not found.
		let auditLocation = target.location ?? '';
		if (target.employeeId) {
			if (!UUID_PATTERN.test(target.employeeId)) {
				return NextResponse.json({error: 'Employee not found'}, {status: 400});
			}
			const employee = await db.query.employees.findFirst({
				where: eq(employees.id, target.employeeId),
				columns: {locations: true},
			});
			const rosterHomes =
				(await getRosterHomesByEmployee([target.employeeId])).get(target.employeeId) || [];
			if (
				!employee ||
				!canViewStaffDocument(viewer, {
					location: null,
					employeeId: target.employeeId,
					employeeLocations: rosterHomes,
				})
			) {
				return NextResponse.json({error: 'Employee not found'}, {status: 400});
			}
			auditLocation = employee.locations.join('|');
		} else if (target.location) {
			const location = await db.query.locations.findFirst({
				where: eq(locations.name, target.location),
				columns: {id: true},
			});
			if (
				!location ||
				!canViewStaffDocument(viewer, {
					location: target.location,
					employeeId: null,
					employeeLocations: null,
				})
			) {
				return NextResponse.json({error: 'Location not found'}, {status: 400});
			}
		}

		const rawTitle = form.get('title');
		const title =
			(typeof rawTitle === 'string' && rawTitle.trim().slice(0, 255)) ||
			file.name.slice(0, 255);
		const rawNotes = form.get('notes');
		const notes = typeof rawNotes === 'string' && rawNotes.trim() ? rawNotes.trim() : null;

		const fileKey = generateFileKey(`staff-documents/${target.category}`, file.name);
		await uploadFile(fileKey, Buffer.from(await file.arrayBuffer()), file.type);

		const [created] = await db
			.insert(staffDocuments)
			.values({
				category: target.category,
				employeeId: target.employeeId,
				location: target.location,
				title,
				notes,
				fileStorageId: fileKey,
				fileName: file.name.slice(0, 255),
				fileSize: file.size,
				contentType: file.type,
				uploadedBy: userId,
			})
			.returning({id: staffDocuments.id});

		await logAudit({
			clerkUserId: userId,
			event: 'staff_document.uploaded',
			details: `id=${created.id},category=${STAFF_DOCUMENT_CATEGORY_LABELS[target.category]},title=${title}`,
			deviceId: 'system',
			location: auditLocation,
		});

		return NextResponse.json({id: created.id}, {status: 201});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff document upload error:', error);
		return NextResponse.json({error: 'Upload failed'}, {status: 500});
	}
}
