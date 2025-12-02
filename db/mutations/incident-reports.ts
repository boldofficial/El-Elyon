import {db} from '../index';
import {incidentReports, residents} from '../schema';
import {eq} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';
import {logAudit} from './audit';
import {InferSelectModel} from 'drizzle-orm';

type IncidentReportSelect = InferSelectModel<typeof incidentReports>;
type IncidentReportInsert = typeof incidentReports.$inferInsert;

export async function createIncidentReport(
	clerkUserId: string,
	data: {
		residentId: string;
		incidentDate: Date;
		incidentType: string;
		severity: string;
		location: string;
		description: string;
		actionTaken?: string;
		witnessNames?: string;
		followUpRequired?: boolean;
		followUpNotes?: string;
		attachments?: string[];
	}
) {
	const userRole = await requireCareAccess(clerkUserId);

	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, data.residentId),
	});

	if (!resident) {
		throw new Error('Resident not found');
	}

	const userLocations =
		userRole.role === 'admin' ? [] : userRole.locations || [];
	if (
		userRole.role !== 'admin' &&
		!userLocations.includes(data.location)
	) {
		throw new Error('Access denied to create incident report for this location');
	}

	const [newIncident] = await db
		.insert(incidentReports)
		.values({
			...data,
			reportedBy: clerkUserId,
			// reportedByName: userRole.name, // Assuming userRole has a name property
			createdAt: new Date(),
		})
		.returning();

	if (!newIncident) {
		throw new Error('Failed to create incident report');
	}

	await logAudit({
		clerkUserId,
		event: 'create_incident_report',
		details: `incidentId=${newIncident.id}, residentId=${data.residentId}, type=${data.incidentType}`,
		deviceId: 'system',
		location: data.location,
	});

	return newIncident;
}

export async function updateIncidentReport(
	clerkUserId: string,
	incidentId: string,
	data: Partial<IncidentReportInsert>
) {
	await requireCareAccess(clerkUserId); // Only care staff/admin can update

	const existingReport = await db.query.incidentReports.findFirst({
		where: eq(incidentReports.id, incidentId),
	});

	if (!existingReport) {
		throw new Error('Incident report not found');
	}

	// Optional: Add location-based access check if needed, similar to create
	// const userRole = await getUserRoleDoc(clerkUserId);
	// if (userRole.role !== 'admin' && !userRole.locations.includes(existingReport.location)) {
	// 	throw new Error('Access denied to update incident report at this location');
	// }

	const [updatedIncident] = await db
		.update(incidentReports)
		.set({
			...data,
			updatedAt: new Date(),
		})
		.where(eq(incidentReports.id, incidentId))
		.returning();

	if (!updatedIncident) {
		throw new Error('Failed to update incident report');
	}

	await logAudit({
		clerkUserId,
		event: 'update_incident_report',
		details: `incidentId=${incidentId}, residentId=${existingReport.residentId}`,
		deviceId: 'system',
		location: existingReport.location,
	});

	return updatedIncident;
}

export async function deleteIncidentReport(
	clerkUserId: string,
	incidentId: string
) {
	await requireCareAccess(clerkUserId); // Only care staff/admin can delete

	const existingReport = await db.query.incidentReports.findFirst({
		where: eq(incidentReports.id, incidentId),
	});

	if (!existingReport) {
		throw new Error('Incident report not found');
	}

	await db.delete(incidentReports).where(eq(incidentReports.id, incidentId));

	await logAudit({
		clerkUserId,
		event: 'delete_incident_report',
		details: `incidentId=${incidentId}, residentId=${existingReport.residentId}`,
		deviceId: 'system',
		location: existingReport.location,
	});

	return {success: true};
}

// You might also want a query to get an incident report by ID, or list them.
// These would typically be in db/queries/incident-reports.ts
