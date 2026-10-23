// src/app/api/staff-directory/roster/route.ts
// POST adds a staff member to a home's roster (admins, or supervisors with
// manage_staff_directory at their own homes — see canAddToRoster). Re-adding
// someone already on that roster updates their title instead. The hire date
// lives on the employee's profile, not here.
// The roster never changes employees.locations (clock-in and resident
// access) — see staffRosterEntries in db/schema.ts.

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/db/index';
import {employees, locations, staffRosterEntries} from '@/db/schema';
import {AccessDeniedError, logAudit} from '@/lib/db-helpers';
import {canAddToRoster, canViewHome} from '@/lib/staff-directory';
import {requireStaffDirectoryManager} from '@/db/queries/staff-documents';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const viewer = await requireStaffDirectoryManager(userId);
		const body = await req.json().catch(() => ({}));

		const location = typeof body.location === 'string' ? body.location.trim() : '';
		const employeeId = typeof body.employeeId === 'string' ? body.employeeId : '';
		const title =
			typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 255) : null;

		if (!location) return NextResponse.json({error: 'Choose a home'}, {status: 400});
		if (!UUID_PATTERN.test(employeeId)) {
			return NextResponse.json({error: 'Choose a staff member'}, {status: 400});
		}

		const [home, employee] = await Promise.all([
			db.query.locations.findFirst({where: eq(locations.name, location), columns: {id: true}}),
			db.query.employees.findFirst({
				where: eq(employees.id, employeeId),
				columns: {name: true, locations: true},
			}),
		]);
		if (!home || !canViewHome(viewer, location)) {
			return NextResponse.json({error: 'Home not found'}, {status: 400});
		}
		if (!employee) return NextResponse.json({error: 'Staff member not found'}, {status: 400});
		if (!canAddToRoster(viewer, location, employee.locations || [])) {
			return NextResponse.json(
				{error: `${employee.name} isn't assigned to ${location}. Ask an admin to add them.`},
				{status: 400}
			);
		}

		const [entry] = await db
			.insert(staffRosterEntries)
			.values({location, employeeId, title, createdBy: userId})
			.onConflictDoUpdate({
				target: [staffRosterEntries.location, staffRosterEntries.employeeId],
				set: {title, updatedAt: new Date(), updatedBy: userId},
			})
			.returning({id: staffRosterEntries.id});

		await logAudit({
			clerkUserId: userId,
			event: 'staff_roster.saved',
			details: `employee=${employeeId} (${employee.name}),title=${title ?? ''}`,
			deviceId: 'system',
			location,
		});

		return NextResponse.json({id: entry.id}, {status: 201});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: error.message}, {status: 403});
		}
		console.error('Staff roster save error:', error);
		return NextResponse.json({error: 'Failed to save the roster'}, {status: 500});
	}
}
