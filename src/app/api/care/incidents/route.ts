// src/app/api/care/incidents/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess, logAudit} from '@/lib/db-helpers';
import {
	createIncidentReport,
	updateIncidentReport,
	deleteIncidentReport,
} from '@/db/mutations/incident-reports';
import {db} from '@/db/index';
import {incidentReports} from '@/db/schema';
import {eq, and, inArray} from 'drizzle-orm';

// GET - List incident reports
export async function GET(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const userRole = await requireCareAccess(userId);

		const {searchParams} = new URL(request.url);
		const residentId = searchParams.get('residentId');
		const location = searchParams.get('location');

		const conditions = [];
		if (residentId) {
			conditions.push(eq(incidentReports.residentId, residentId));
		}

		// Non-admins are scoped to their assigned locations -- a client-supplied
		// `location` param is only honored when it's one of theirs, otherwise
		// they'd be able to pull reports for a facility they aren't assigned to.
		if (userRole.role !== 'admin') {
			const userLocations = userRole.locations || [];
			if (location) {
				if (!userLocations.includes(location)) {
					return NextResponse.json([]);
				}
				conditions.push(eq(incidentReports.location, location));
			} else if (userLocations.length > 0) {
				conditions.push(inArray(incidentReports.location, userLocations));
			} else {
				conditions.push(eq(incidentReports.location, '__no_access__'));
			}
		} else if (location) {
			conditions.push(eq(incidentReports.location, location));
		}

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const reports = await db.query.incidentReports.findMany({
			where: whereClause,
			orderBy: (reports, {desc}) => [desc(reports.incidentDate)],
			with: {
				resident: true,
			},
		});

		return NextResponse.json(reports);
	} catch (error: any) {
		console.error('Error fetching incident reports:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// POST - Create a new incident report
export async function POST(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const body = await request.json();

		const newIncident = await createIncidentReport(userId, {
			residentId: body.residentId,
			incidentDate: body.incidentDate ? new Date(body.incidentDate) : new Date(),
			incidentType: body.incidentType,
			severity: body.severity,
			location: body.location,
			description: body.description,
			actionTaken: body.actionTaken,
			witnessNames: body.witnessNames,
			followUpRequired: body.followUpRequired,
			followUpNotes: body.followUpNotes,
			attachments: body.attachments,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'CREATE_INCIDENT_REPORT',
			details: `Created incident ${newIncident.id} for resident ${body.residentId}`,
			deviceId: 'system',
			location: body.location,
		});

		return NextResponse.json(newIncident, {status: 201});
	} catch (error: any) {
		console.error('Error creating incident report:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// PATCH - Update an existing incident report
export async function PATCH(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const body = await request.json();
		const incidentId = body.incidentId;

		if (!incidentId) {
			return NextResponse.json(
				{error: 'Incident ID is required for PATCH'},
				{status: 400}
			);
		}

		const updatedIncident = await updateIncidentReport(userId, incidentId, {
			incidentDate: body.incidentDate ? new Date(body.incidentDate) : undefined,
			incidentType: body.incidentType,
			severity: body.severity,
			location: body.location,
			description: body.description,
			actionTaken: body.actionTaken,
			witnessNames: body.witnessNames,
			followUpRequired: body.followUpRequired,
			followUpNotes: body.followUpNotes,
			attachments: body.attachments,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_INCIDENT_REPORT',
			details: `Updated incident ${incidentId}`,
			deviceId: 'system',
			location: updatedIncident.location,
		});

		return NextResponse.json(updatedIncident);
	} catch (error: any) {
		console.error('Error updating incident report:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// DELETE - Delete an incident report
export async function DELETE(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {incidentId} = await request.json();

		if (!incidentId) {
			return NextResponse.json(
				{error: 'Incident ID is required for DELETE'},
				{status: 400}
			);
		}

		await deleteIncidentReport(userId, incidentId);

		await logAudit({
			clerkUserId: userId,
			event: 'DELETE_INCIDENT_REPORT',
			details: `Deleted incident ${incidentId}`,
			deviceId: 'system',
			location: '', // Location will be derived within the mutation
		});

		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('Error deleting incident report:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
