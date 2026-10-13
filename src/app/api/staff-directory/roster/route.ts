// src/app/api/staff-directory/roster/route.ts
// POST adds a staff member to a home's roster (admins only). Re-adding
// someone already on that roster updates their title / start date instead.
// The roster never changes employees.locations (clock-in and resident
// access) — see staffRosterEntries in db/schema.ts.

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/db/index';
import {employees, locations, staffRosterEntries} from '@/db/schema';
import {AccessDeniedError, logAudit, requireAdminAccess} from '@/lib/db-helpers';
import {isCalendarDate} from '@/lib/staff-directory';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);
		const body = await req.json().catch(() => ({}));

		const location = typeof body.location === 'string' ? body.location.trim() : '';
		const employeeId = typeof body.employeeId === 'string' ? body.employeeId : '';
		const title =
			typeof body.title === 'string' && body.title.trim() ? body.title.trim().slice(0, 255) : null;
		const rosterHireDate =
			typeof body.rosterHireDate === 'string' && body.rosterHireDate ? body.rosterHireDate : null;

		if (!location) return NextResponse.json({error: 'Choose a home'}, {status: 400});
		if (!UUID_PATTERN.test(employeeId)) {
			return NextResponse.json({error: 'Choose a staff member'}, {status: 400});
		}
		if (rosterHireDate && !isCalendarDate(rosterHireDate)) {
			return NextResponse.json({error: 'Enter a valid start date'}, {status: 400});
		}

		const [home, employee] = await Promise.all([
			db.query.locations.findFirst({where: eq(locations.name, location), columns: {id: true}}),
			db.query.employees.findFirst({where: eq(employees.id, employeeId), columns: {name: true}}),
		]);
		if (!home) return NextResponse.json({error: 'Home not found'}, {status: 400});
		if (!employee) return NextResponse.json({error: 'Staff member not found'}, {status: 400});

		const [entry] = await db
			.insert(staffRosterEntries)
			.values({location, employeeId, title, rosterHireDate, createdBy: userId})
			.onConflictDoUpdate({
				target: [staffRosterEntries.location, staffRosterEntries.employeeId],
				set: {title, rosterHireDate, updatedAt: new Date(), updatedBy: userId},
			})
			.returning({id: staffRosterEntries.id});

		await logAudit({
			clerkUserId: userId,
			event: 'staff_roster.saved',
			details: `employee=${employeeId} (${employee.name}),title=${title ?? ''},start=${rosterHireDate ?? ''}`,
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
