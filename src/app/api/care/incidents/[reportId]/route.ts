// ==========================================
// src/app/api/care/incidents/[reportId]/route.ts
// ==========================================

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess, logAudit} from '@/lib/db-helpers';
import {getIncidentReport} from '@/db/queries/incident-reports';
import { deleteIncidentReport, updateIncidentReport } from '@/db/mutations/incident-reports';
// import {
// 	updateIncidentReport,
// 	deleteIncidentReport,
// } from '@/db/mutations/care-activities';

// GET - Get single incident report
export async function GET(
	request: Request,
	{params}: {params: {reportId: string}}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const reportId = params.reportId;
		const report = await getIncidentReport(reportId, userId);

		if (!report) {
			return NextResponse.json({error: 'Report not found'}, {status: 404});
		}

		return NextResponse.json(report);
	} catch (error: any) {
		console.error('Error fetching incident report:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// PATCH - Update incident report
export async function PATCH(
	request: Request,
	{params}: {params: {reportId: string}}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const reportId = params.reportId;
		const body = await request.json();

		const updated = await updateIncidentReport(userId, reportId, {
			incidentDate: body.incidentDate ? new Date(body.incidentDate) : undefined,
			incidentType: body.incidentType,
			severity: body.severity,
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
			details: `Updated incident report ${reportId}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json(updated);
	} catch (error: any) {
		console.error('Error updating incident report:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// DELETE - Delete incident report
export async function DELETE(
	request: Request,
	{params}: {params: {reportId: string}}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const reportId = params.reportId;
		await deleteIncidentReport(userId, reportId);

		await logAudit({
			clerkUserId: userId,
			event: 'DELETE_INCIDENT_REPORT',
			details: `Deleted incident report ${reportId}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('Error deleting incident report:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
