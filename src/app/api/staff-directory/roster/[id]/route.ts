// src/app/api/staff-directory/roster/[id]/route.ts
// DELETE takes a staff member off one home's roster (admins only). Their
// employee record, documents and app access are untouched.

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/db/index';
import {staffRosterEntries} from '@/db/schema';
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
			return NextResponse.json({error: 'Roster entry not found'}, {status: 404});
		}

		const [removed] = await db
			.delete(staffRosterEntries)
			.where(eq(staffRosterEntries.id, id))
			.returning({
				employeeId: staffRosterEntries.employeeId,
				location: staffRosterEntries.location,
				title: staffRosterEntries.title,
			});
		if (!removed) {
			return NextResponse.json({error: 'Roster entry not found'}, {status: 404});
		}

		await logAudit({
			clerkUserId: userId,
			event: 'staff_roster.removed',
			details: `employee=${removed.employeeId},title=${removed.title ?? ''}`,
			deviceId: 'system',
			location: removed.location,
		});

		return NextResponse.json({success: true});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff roster remove error:', error);
		return NextResponse.json({error: 'Failed to update the roster'}, {status: 500});
	}
}
