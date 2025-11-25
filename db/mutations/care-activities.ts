// src/db/mutations/care-activities.ts

import {db} from '../index';
import {residentLogs, residentLogActivities, incidentReports} from '../schema';
import {eq} from 'drizzle-orm';

export async function createResidentLog(data: {
	residentId: string;
	logType: string;
	content?: string;
	location: string;
	shiftId?: string;
	authorId: string;
	authorName: string;
	template?: string;
}) {
	const [log] = await db
		.insert(residentLogs)
		.values({
			...data,
			createdAt: new Date(),
			timestamp: new Date(),
		})
		.returning();

	return log;
}

export async function createLogActivity(data: {
	logId: string;
	activityType: string;
	completed: boolean;
	notes?: string;
}) {
	const [activity] = await db
		.insert(residentLogActivities)
		.values({
			...data,
			timestamp: new Date(),
		})
		.returning();

	return activity;
}

export async function createResidentLogWithActivities(data: {
	residentId: string;
	logType: string;
	content?: string;
	location: string;
	shiftId?: string;
	authorId: string;
	authorName: string;
	template?: string;
	activities?: Array<{
		activityType: string;
		completed: boolean;
		notes?: string;
	}>;
}) {
	// Create the log
	const log = await createResidentLog({
		residentId: data.residentId,
		logType: data.logType,
		content: data.content,
		location: data.location,
		shiftId: data.shiftId,
		authorId: data.authorId,
		authorName: data.authorName,
		template: data.template,
	});

	// Create activities if provided
	if (data.activities && data.activities.length > 0) {
		const activities = await Promise.all(
			data.activities.map((activity) =>
				createLogActivity({
					logId: log.id,
					activityType: activity.activityType,
					completed: activity.completed,
					notes: activity.notes,
				})
			)
		);

		return {log, activities};
	}

	return {log, activities: []};
}

export async function createIncidentReport(data: {
	residentId: string;
	reportedBy: string;
	reportedByName: string;
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
}) {
	const [report] = await db
		.insert(incidentReports)
		.values({
			...data,
			createdAt: new Date(),
		})
		.returning();

	return report;
}

export async function updateIncidentReport(
	reportId: string,
	data: {
		incidentDate?: Date;
		incidentType?: string;
		severity?: string;
		description?: string;
		actionTaken?: string;
		witnessNames?: string;
		followUpRequired?: boolean;
		followUpNotes?: string;
		attachments?: string[];
	}
) {
	const [updated] = await db
		.update(incidentReports)
		.set({
			...data,
			updatedAt: new Date(),
		})
		.where(eq(incidentReports.id, reportId))
		.returning();

	return updated;
}

export async function deleteIncidentReport(reportId: string) {
	await db.delete(incidentReports).where(eq(incidentReports.id, reportId));
}
