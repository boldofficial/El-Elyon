// src/app/api/care/residents/[id]/incidents/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess, logAudit} from '@/lib/db-helpers';
import {getResidentIncidentReports} from '@/db/queries/incident-reports';
// import {getClerkUser} from "@/lib/clerk";
import {createIncidentReport} from '@/db/mutations/incident-reports';

// GET - List incident reports for a resident
export async function GET(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {id: residentId} = await params;
		const reports = await getResidentIncidentReports(residentId, userId);

		return NextResponse.json(reports);
	} catch (error: any) {
		console.error('Error fetching incident reports:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// POST - Create new incident report
export async function POST(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {id: residentId} = await params;
		const body = await request.json();

		const report = await createIncidentReport(userId, {
			residentId,
			incidentDate: new Date(body.incidentDate),
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
			details: `Created ${body.severity} incident report for resident ${residentId}`,
			deviceId: 'system',
			location: body.location,
		});

		return NextResponse.json(report, {status: 201});
	} catch (error: any) {
		console.error('Error creating incident report:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
