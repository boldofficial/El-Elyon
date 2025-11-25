// src/db/queries/incident-reports.ts

import {db} from '../index';
import {incidentReports} from '../schema';
import {eq, desc, and, gte, lte} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';

// ============================
// Incident Report Queries
// ============================

export async function getResidentIncidentReports(
	residentId: string,
	clerkUserId: string
) {
	await requireCareAccess(clerkUserId);

	const reports = await db.query.incidentReports.findMany({
		where: eq(incidentReports.residentId, residentId),
		orderBy: [desc(incidentReports.incidentDate)],
	});

	return reports;
}

export async function getIncidentReport(reportId: string, clerkUserId: string) {
	await requireCareAccess(clerkUserId);

	const report = await db.query.incidentReports.findFirst({
		where: eq(incidentReports.id, reportId),
	});

	return report;
}

export async function listIncidentReports(
	clerkUserId: string,
	filters?: {
		residentId?: string;
		location?: string;
		severity?: string;
		incidentType?: string;
		startDate?: Date;
		endDate?: Date;
	}
) {
	await requireCareAccess(clerkUserId);

	const conditions = [];

	if (filters?.residentId) {
		conditions.push(eq(incidentReports.residentId, filters.residentId));
	}

	if (filters?.location) {
		conditions.push(eq(incidentReports.location, filters.location));
	}

	if (filters?.severity) {
		conditions.push(eq(incidentReports.severity, filters.severity));
	}

	if (filters?.incidentType) {
		conditions.push(eq(incidentReports.incidentType, filters.incidentType));
	}

	if (filters?.startDate) {
		conditions.push(gte(incidentReports.incidentDate, filters.startDate));
	}

	if (filters?.endDate) {
		conditions.push(lte(incidentReports.incidentDate, filters.endDate));
	}

	const reports = await db.query.incidentReports.findMany({
		where: conditions.length > 0 ? and(...conditions) : undefined,
		orderBy: [desc(incidentReports.incidentDate)],
	});

	return reports;
}
