// ==========================================
// src/app/api/care/incidents/route.ts
// ==========================================

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {listIncidentReports} from '@/db/queries/incident-reports';

// GET - List all incident reports with filters
export async function GET(request: Request) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireCareAccess(userId);

		const {searchParams} = new URL(request.url);

		const filters = {
			residentId: searchParams.get('residentId') || undefined,
			location: searchParams.get('location') || undefined,
			severity: searchParams.get('severity') || undefined,
			incidentType: searchParams.get('incidentType') || undefined,
			startDate: searchParams.get('startDate')
				? new Date(searchParams.get('startDate')!)
				: undefined,
			endDate: searchParams.get('endDate')
				? new Date(searchParams.get('endDate')!)
				: undefined,
		};

		const reports = await listIncidentReports(userId, filters);

		return NextResponse.json(reports);
	} catch (error: any) {
		console.error('Error fetching incident reports:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
