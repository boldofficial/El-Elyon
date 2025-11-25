import {db} from '../index';
import {residents, roles, employees, residentLogs, config, shifts, isp, ispAcknowledgments} from '../schema';
import {eq, or, and, isNull} from 'drizzle-orm';
import {requireCareAccess} from '@/lib/db-helpers';

// Query: Get residents for current user's locations
export async function getMyResidents(clerkUserId: string) {
	const userRole = await requireCareAccess(clerkUserId);

	// Admin can see all residents
	if (userRole.role === 'admin') {
		const allResidents = await db.query.residents.findMany();
		return allResidents.map((resident) => ({
			id: resident.id,
			name: resident.name,
			location: resident.location,
			dob: resident.dateOfBirth,
			createdAt: resident.createdAt,
		}));
	}

	// Staff and supervisors see residents in their assigned locations
	const userLocations = userRole.locations || [];
	if (userLocations.length === 0) {
		return [];
	}

	const filteredResidents = await db.query.residents.findMany({
		where: or(...userLocations.map(location => eq(residents.location, location))),
	});

	return filteredResidents.map((resident) => ({
		id: resident.id,
		name: resident.name,
		location: resident.location,
		dob: resident.dateOfBirth,
		createdAt: resident.createdAt,
	}));
}

// Query: Get resident logs for locations accessible to current user
export async function getResidentLogs(clerkUserId: string, residentId?: string, limit: number = 50) {
	const userRole = await requireCareAccess(clerkUserId);
	const userLocations =
		userRole.role === 'admin' ? [] : userRole.locations || [];

	let logs;

	if (residentId) {
		// Get logs for specific resident
		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, residentId),
		});
		if (!resident) throw new Error('Resident not found');

		// Check if user has access to this resident's location
		if (
			userRole.role !== 'admin' &&
			!userLocations.includes(resident.location)
		) {
			throw new Error("Access denied to this resident's logs");
		}

		logs = await db.query.residentLogs.findMany({
			where: eq(residentLogs.residentId, residentId),
			orderBy: (residentLogs, {desc}) => [desc(residentLogs.createdAt)],
			limit: limit,
		});
	} else {
		// Get all logs for user's accessible locations
		const allLogs = await db.query.residentLogs.findMany({
			orderBy: (residentLogs, {desc}) => [desc(residentLogs.createdAt)],
			limit: 100, // Default limit for all logs
		});

		if (userRole.role === 'admin') {
			logs = allLogs;
		} else {
			// Filter logs by accessible residents
			const accessibleResidents = await db.query.residents.findMany({
				where: or(...userLocations.map(location => eq(residents.location, location))),
			});
			const accessibleResidentIds = accessibleResidents.map((r) => r.id);

			logs = allLogs.filter((log) =>
				accessibleResidentIds.includes(log.residentId)
			);
		}
	}

	// Get additional data for each log
	const employeesList = await db.query.employees.findMany();
	const residentsList = await db.query.residents.findMany();

	const enrichedLogs = await Promise.all(
		logs.map(async (log) => {
			const author = employeesList.find((e) => e.clerkUserId === log.authorId);
			const resident = residentsList.find((r) => r.id === log.residentId);

			return {
				id: log.id,
				residentId: log.residentId,
				residentName: resident?.name || 'Unknown Resident',
				residentLocation: resident?.location || 'Unknown Location',
				authorId: log.authorId,
				authorName: author?.name || author?.workEmail || 'Unknown User',
				version: log.version,
				template: log.template,
				content: log.content,
				createdAt: log.createdAt,
			};
		})
	);

	return enrichedLogs;
}

// Query: Get recent logs summary for dashboard
export async function getRecentLogsSummary(clerkUserId: string) {
	const userRole = await requireCareAccess(clerkUserId);
	const userLocations =
		userRole.role === 'admin' ? [] : userRole.locations || [];

	// Get logs from last 7 days
	const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
	const recentLogs = await db.query.residentLogs.findMany({
		where: (residentLogs, {gt}) => gt(residentLogs.createdAt, sevenDaysAgo),
		orderBy: (residentLogs, {desc}) => [desc(residentLogs.createdAt)],
		limit: 100,
	});

	let filteredLogs = recentLogs;

	if (userRole.role !== 'admin') {
		// Filter by accessible locations
		const accessibleResidents = await db.query.residents.findMany({
			where: or(...userLocations.map(location => eq(residents.location, location))),
		});
		const accessibleResidentIds = accessibleResidents.map((r) => r.id);

		filteredLogs = recentLogs.filter((log) =>
			accessibleResidentIds.includes(log.residentId)
		);
	}

	// Group by location and template
	const summary = {
		totalLogs: filteredLogs.length,
		logsByLocation: {} as Record<string, number>,
		logsByTemplate: {} as Record<string, number>,
		myLogs: filteredLogs.filter((log) => log.authorId === clerkUserId).length,
	};

	const residentsList = await db.query.residents.findMany();

	filteredLogs.forEach((log) => {
		const resident = residentsList.find((r) => r.id === log.residentId);
		if (resident) {
			summary.logsByLocation[resident.location] =
				(summary.logsByLocation[resident.location] || 0) + 1;
		}
		if (log.template) {
			summary.logsByTemplate[log.template] =
				(summary.logsByTemplate[log.template] || 0) + 1;
		}
	});

	return summary;
}

// Query: Get log templates
export async function getLogTemplates(clerkUserId: string) {
	await requireCareAccess(clerkUserId);

	// Return predefined templates - could be made configurable later
	return [
		{
			id: 'daily_notes',
			name: 'Daily Notes',
			description: 'General daily observations and notes',
			fields: [
				{
					name: 'mood',
					label: 'Mood/Behavior',
					type: 'select',
					options: ['Good', 'Fair', 'Concerning'],
				},
				{
					name: 'activities',
					label: 'Activities Participated',
					type: 'textarea',
				},
				{
					name: 'meals',
					label: 'Meal Participation',
					type: 'select',
					options: ['Full', 'Partial', 'Minimal'],
				},
				{name: 'notes', label: 'Additional Notes', type: 'textarea'},
			],
		},
		{
			id: 'incident_report',
			name: 'Incident Report',
			description: 'Report any incidents or concerns',
			fields: [
				{
					name: 'incident_type',
					label: 'Incident Type',
					type: 'select',
					options: ['Medical', 'Behavioral', 'Safety', 'Other'],
				},
				{name: 'time', label: 'Time of Incident', type: 'time'},
				{name: 'description', label: 'Description', type: 'textarea'},
				{name: 'action_taken', label: 'Action Taken', type: 'textarea'},
				{
					name: 'follow_up',
					label: 'Follow-up Required',
					type: 'select',
					options: ['Yes', 'No'],
				},
			],
		},
		{
			id: 'medication_log',
			name: 'Medication Log',
			description: 'Track medication administration',
			fields: [
				{name: 'medication', label: 'Medication', type: 'text'},
				{name: 'dosage', label: 'Dosage', type: 'text'},
				{name: 'time_given', label: 'Time Given', type: 'time'},
				{name: 'administered_by', label: 'Administered By', type: 'text'},
				{name: 'notes', label: 'Notes', type: 'textarea'},
			],
		},
		{
			id: 'care_plan_update',
			name: 'Care Plan Update',
			description: 'Updates to resident care plan',
			fields: [
				{
					name: 'area',
					label: 'Care Area',
					type: 'select',
					options: [
						'Physical',
						'Mental Health',
						'Social',
						'Medical',
						'Activities',
					],
				},
				{name: 'update', label: 'Update Description', type: 'textarea'},
				{name: 'goals', label: 'Updated Goals', type: 'textarea'},
				{name: 'next_review', label: 'Next Review Date', type: 'date'},
			],
		},
	];
}

// Query: Search logs
export async function searchLogs(
	clerkUserId: string,
	query: string,
	residentId?: string,
	template?: string,
	dateFrom?: number,
	dateTo?: number,
	limit: number = 100
) {
	const userRole = await requireCareAccess(clerkUserId);
	const userLocations =
		userRole.role === 'admin' ? [] : userRole.locations || [];

	let logs = await db.query.residentLogs.findMany({
		orderBy: (residentLogs, {desc}) => [desc(residentLogs.createdAt)],
		limit: limit,
	});

	// Filter by user's accessible locations
	if (userRole.role !== 'admin') {
		const accessibleResidents = await db.query.residents.findMany({
			where: or(...userLocations.map(location => eq(residents.location, location))),
		});
		const accessibleResidentIds = accessibleResidents.map((r) => r.id);

		logs = logs.filter((log) =>
			accessibleResidentIds.includes(log.residentId)
		);
	}

	// Apply filters
	if (residentId) {
		logs = logs.filter((log) => log.residentId === residentId);
	}

	if (template) {
		logs = logs.filter((log) => log.template === template);
	}

	if (dateFrom) {
		logs = logs.filter(
			(log) => log.createdAt && log.createdAt.getTime() >= dateFrom
		);
	}

	if (dateTo) {
		logs = logs.filter(
			(log) => log.createdAt && log.createdAt.getTime() <= dateTo
		);
	}

	// Search in content
	if (query.trim()) {
		const searchTerm = query.toLowerCase();
		logs = logs.filter(
			(log) =>
				log.content.toLowerCase().includes(searchTerm) ||
				log.template?.toLowerCase().includes(searchTerm)
		);
	}

	// Enrich with additional data
	const employeesList = await db.query.employees.findMany();
	const residentsList = await db.query.residents.findMany();

	const enrichedLogs = logs.map((log) => {
		const author = employeesList.find((e) => e.clerkUserId === log.authorId);
		const resident = residentsList.find((r) => r.id === log.residentId);

		return {
			id: log.id,
			residentId: log.residentId,
			residentName: resident?.name || 'Unknown Resident',
			residentLocation: resident?.location || 'Unknown Location',
			authorId: log.authorId,
			authorName: author?.name || author?.workEmail || 'Unknown User',
			version: log.version,
			template: log.template,
			content: log.content,
			createdAt: log.createdAt,
		};
	});

	return enrichedLogs;
}

// Query: Check if selfie is enforced
export async function isSelfieEnforced() {
	const config = await db.query.config.findFirst();
	return config?.selfieEnforced || false;
}

// Query: Get current shift for user
export async function getCurrentShift(clerkUserId: string) {
	await requireCareAccess(clerkUserId);

	const currentShift = await db.query.shifts.findFirst({
		where: and(
			eq(shifts.clerkUserId, clerkUserId),
			isNull(shifts.clockOutTime)
		),
		orderBy: (shifts, {desc}) => [desc(shifts.clockInTime)],
	});

	return currentShift
		? {
				id: currentShift.id,
				location: currentShift.location,
				clockInTime: currentShift.clockInTime,
				duration: Date.now() - currentShift.clockInTime.getTime(),
			}
		: null;
}

// Query: Get resident ISP status
export async function getResidentIspStatus(residentId: string, clerkUserId: string) {
	const userRole = await requireCareAccess(clerkUserId);
	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, residentId),
	});
	if (!resident) return null;

	// Check if user has access to this resident's location
	const userLocations =
		userRole.role === 'admin' ? [] : userRole.locations || [];
	if (
		userRole.role !== 'admin' &&
		!userLocations.includes(resident.location)
	) {
		return null; // Access denied
	}

	const latestIsp = await db.query.isp.findFirst({
		where: and(
			eq(isp.residentId, residentId),
			eq(isp.published, true)
		),
		orderBy: (isp, {desc}) => [desc(isp.createdAt)],
	});

	if (!latestIsp) return null;

	const acknowledgment = await db.query.ispAcknowledgments.findFirst({
		where: and(
			eq(ispAcknowledgments.residentId, residentId),
			eq(ispAcknowledgments.clerkUserId, clerkUserId),
			eq(ispAcknowledgments.ispId, latestIsp.id)
		),
	});

	return {
		id: latestIsp.id,
		version: latestIsp.version || 1,
		dueAt: latestIsp.dueAt,
		acknowledged: !!acknowledgment,
	};
}

// Query: Get pending ISP acknowledgments for user
export async function getPendingAcknowledgments(clerkUserId: string) {
	await requireCareAccess(clerkUserId);

	const isps = await db.query.isp.findMany({
		where: eq(isp.published, true),
	});
	const existingAcks = await db.query.ispAcknowledgments.findMany({
		where: eq(ispAcknowledgments.clerkUserId, clerkUserId),
	});

	const pending = isps.filter((ispItem) => {
		return !existingAcks.some(
			(ack) => ack.residentId === ispItem.residentId && ack.ispId === ispItem.id
		);
	});

	const enriched = await Promise.all(
		pending.map(async (ispItem) => {
			const resident = await db.query.residents.findFirst({
				where: eq(residents.id, ispItem.residentId),
			});
			return {
				ispId: ispItem.id,
				residentId: ispItem.residentId,
				ispVersion: ispItem.version || 1,
				location: resident?.location || 'Unknown',
				dueAt: ispItem.dueAt || new Date(),
			};
		})
	);
	return enriched;
}

// Query: Get resident audit trail
export async function getResidentAuditTrail(clerkUserId: string, residentId: string) {
  const userRole = await requireCareAccess(clerkUserId);

  const resident = await db.query.residents.findFirst({
    where: eq(residents.id, residentId),
  });
  if (!resident) throw new Error('Resident not found');

  const userLocations =
    userRole.role === 'admin' ? [] : userRole.locations || [];
  if (
    userRole.role !== 'admin' &&
    !userLocations.includes(resident.location)
  ) {
    throw new Error('Access denied to view audit trail for this resident');
  }

  // Fetch audit logs that are related to this resident
  // This assumes that residentId is part of the details or there's a direct link
  // For now, we'll filter by details containing the residentId.
  // A more robust solution might involve adding a residentId column to auditLogs.
  const auditLogs = await db.query.auditLogs.findMany({
    where: (auditLogs, { like }) => like(auditLogs.details, `%residentId=${residentId}%`),
    orderBy: (auditLogs, { desc }) => [desc(auditLogs.timestamp)],
    limit: 50, // Limit to recent audit logs
  });

  return auditLogs.map(log => ({
    id: log.id,
    event: log.event,
    details: log.details,
    timestamp: log.timestamp,
    clerkUserId: log.clerkUserId,
  }));
}
