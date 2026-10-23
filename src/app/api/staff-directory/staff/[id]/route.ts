// src/app/api/staff-directory/staff/[id]/route.ts
// GET: one staff member's directory profile — admins, or a privileged
// supervisor at a home this person is rostered at. Supervisor views are
// audit-logged (the profile holds date of birth and home address).
// PATCH: admins, or supervisors with manage_staff_directory for staff
// rostered at their homes, edit profile fields. Only admins edit an admin's
// profile. Name and email stay in People management because they're tied to
// the login.

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/db/index';
import {employees} from '@/db/schema';
import {AccessDeniedError, logAudit} from '@/lib/db-helpers';
import {parseStaffProfileUpdate} from '@/lib/staff-directory';
import {
	requireStaffDirectoryManager,
	requireStaffDocumentViewer,
} from '@/db/queries/staff-documents';
import {getStaffProfile} from '@/db/queries/staff-directory';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const privateNoStore = {'Cache-Control': 'private, no-store'};

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

		const profile = UUID_PATTERN.test(id) ? await getStaffProfile(viewer, id) : null;
		if (!profile) {
			return NextResponse.json({error: 'Staff member not found'}, {status: 404});
		}

		if (viewer.role !== 'admin') {
			await logAudit({
				clerkUserId: userId,
				event: 'staff_profile.viewed',
				details: `employee=${id}`,
				deviceId: 'system',
				location: profile.homes.map((home) => home.location).join('|'),
			});
		}

		return NextResponse.json(
			{...profile, canEdit: viewer.canManage && (viewer.role === 'admin' || !profile.isAdmin)},
			{headers: privateNoStore}
		);
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff profile error:', error);
		return NextResponse.json({error: 'Failed to load this profile'}, {status: 500});
	}
}

export async function PATCH(
	req: NextRequest,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const viewer = await requireStaffDirectoryManager(userId);
		const {id} = await params;
		if (!UUID_PATTERN.test(id)) {
			return NextResponse.json({error: 'Staff member not found'}, {status: 404});
		}

		if (viewer.role !== 'admin') {
			// Not rostered at one of their homes reads the same as missing.
			const profile = await getStaffProfile(viewer, id);
			if (!profile) {
				return NextResponse.json({error: 'Staff member not found'}, {status: 404});
			}
			if (profile.isAdmin) {
				return NextResponse.json(
					{error: "Only an admin can edit an admin's profile"},
					{status: 403}
				);
			}
		}

		const today = new Date().toISOString().slice(0, 10);
		const parsed = parseStaffProfileUpdate(await req.json().catch(() => null), today);
		if (!parsed.ok) {
			return NextResponse.json({error: parsed.error}, {status: 400});
		}

		const {dateOfHire, ...rest} = parsed.update;
		const [updated] = await db
			.update(employees)
			.set({
				...rest,
				// date_of_hire predates the directory and is a timestamp column;
				// store calendar dates at UTC midnight so they read back unchanged.
				...(dateOfHire !== undefined
					? {dateOfHire: dateOfHire ? new Date(`${dateOfHire}T00:00:00Z`) : null}
					: {}),
				updatedAt: new Date(),
			})
			.where(eq(employees.id, id))
			.returning({id: employees.id});
		if (!updated) {
			return NextResponse.json({error: 'Staff member not found'}, {status: 404});
		}

		await logAudit({
			clerkUserId: userId,
			event: 'staff_profile.updated',
			details: `employee=${id},fields=${Object.keys(parsed.update).join('|')}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json({success: true});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff profile update error:', error);
		return NextResponse.json({error: 'Failed to save the profile'}, {status: 500});
	}
}
