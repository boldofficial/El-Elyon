import {db} from '../index';
import {
	residents,
	ispFiles,
	fireEvac,
	complianceAlerts,
	roles,
	employees,
	guardianChecklistLinks,
	guardianChecklistTemplates,
} from '../schema';
import {eq, and, desc, gte, lte, sql, inArray} from 'drizzle-orm';
import {requireAdminAccess, requireCareAccess, getUserRoleDoc} from '@/lib/db-helpers';

// Internal: List all residents (no auth)
export async function internalListResidents() {
	return await db.query.residents.findMany();
}

// Internal: List all ISP files for a resident (no auth)
export async function internalListResidentISPFiles(residentId: string) {
	return await db.query.ispFiles.findMany({
		where: eq(ispFiles.residentId, residentId),
	});
}

// --- NEW: Get compliance overview for workspace ---
export async function getComplianceOverview(clerkUserId: string) {
	const role = await getUserRoleDoc(clerkUserId);
	if (!role) throw new Error('Forbidden');

	const userLocations = role.locations ?? [];
	const isAdmin = role.role === 'admin';

	if (!isAdmin && userLocations.length === 0) {
		return [];
	}

	const items = [];

	// Get ISP items from new isp_files table - filter by user"s locations
	const allResidents = await db.query.residents.findMany();
	const filteredResidents = isAdmin
		? allResidents
		: allResidents.filter((r) => userLocations.includes(r.location));

	for (const resident of filteredResidents) {
		const ispFilesList = await db.query.ispFiles.findMany({
			where: eq(ispFiles.residentId, resident.id),
		});

		const activeISP = ispFilesList.find((f) => f.status === 'active');
		if (activeISP) {
			const dueDate = activeISP.effectiveDate.getTime() + 6 * 30 * 24 * 60 * 60 * 1000;
			const now = Date.now();
			const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

			let status = 'ok';
			if (daysUntilDue < 0) status = 'overdue';
			else if (daysUntilDue <= 30) status = 'due-soon';

			items.push({
				id: `isp-${resident.id}`,
				location: resident.location,
				type: 'isp',
				itemName: `ISP - ${resident.name}`,
				description: `${activeISP.versionLabel}`,
				dueDate,
				status,
				lastAction: `Activated ${new Date(activeISP.activatedAt || activeISP.uploadedAt).toLocaleDateString()}`,
				residentId: resident.id,
				residentName: resident.name,
			});
		} else if (ispFilesList.length === 0) {
			items.push({
				id: `isp-${resident.id}`,
				location: resident.location,
				type: 'isp',
				itemName: `ISP - ${resident.name}`,
				description: 'No ISP on file',
				dueDate: Date.now(),
				status: 'overdue',
				lastAction: 'Never uploaded',
				residentId: resident.id,
				residentName: resident.name,
			});
		}
	}

	// Get Fire Evac items - now per resident
	for (const resident of filteredResidents) {
		const fireEvacPlans = await db.query.fireEvac.findMany({
			where: eq(fireEvac.residentId, resident.id),
			orderBy: [desc(fireEvac.createdAt)],
			limit: 1,
		});

		const latestPlan = fireEvacPlans[0];

		if (latestPlan) {
			const dueDate =
				(latestPlan.createdAt?.getTime() || Date.now()) + 365 * 24 * 60 * 60 * 1000;
			const now = Date.now();
			const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

			let status = 'ok';
			if (daysUntilDue < 0) status = 'overdue';
			else if (daysUntilDue <= 30) status = 'due-soon';

			items.push({
				id: `fire-evac-${resident.id}`,
				location: resident.location,
				type: 'fire_evac',
				itemName: `Fire Evac - ${resident.name}`,
				description: `Version ${latestPlan.version}`,
				dueDate,
				status,
				lastAction: `Uploaded ${new Date(latestPlan.createdAt || Date.now()).toLocaleDateString()}`,
				residentId: resident.id,
				residentName: resident.name,
			});
		} else {
			items.push({
				id: `fire-evac-${resident.id}`,
				location: resident.location,
				type: 'fire_evac',
				itemName: `Fire Evac - ${resident.name}`,
				description: 'No plan on file',
				dueDate: Date.now(),
				status: 'overdue',
				lastAction: 'Never uploaded',
				residentId: resident.id,
				residentName: resident.name,
			});
		}
	}

	return items;
}

// --- NEW: Get guardian checklist links ---
export async function getGuardianChecklistLinks(clerkUserId: string) {
	const role = await getUserRoleDoc(clerkUserId);
	if (!role) throw new Error('Forbidden');

	const userLocations = role.locations ?? [];
	const isAdmin = role.role === 'admin';

	const links = await db.query.guardianChecklistLinks.findMany();
	const residentsList = await db.query.residents.findMany();
	const templates = await db.query.guardianChecklistTemplates.findMany();

	const result = [];

	for (const link of links) {
		const resident = residentsList.find((r) => r.id === link.residentId);
		if (!resident) continue;

		if (!isAdmin && !userLocations.includes(resident.location)) continue;

		const template = templates.find((t) => t.id === link.templateId);
		const now = Date.now();

		result.push({
			id: link.id,
			location: resident.location,
			templateName: template?.name || 'Unknown Template',
			completed: link.completed,
			expired: link.expiresAt.getTime() < now,
			sentDate: link.sentDate.getTime(),
			expiresAt: link.expiresAt.getTime(),
		});
	}

	return result;
}

// --- NEW: Get fire evacuation plans ---
export async function getFireEvacPlans(clerkUserId: string) {
	const role = await getUserRoleDoc(clerkUserId);
	if (!role) throw new Error('Forbidden');

	const userLocations = role.locations ?? [];
	const isAdmin = role.role === 'admin';

	const residentsList = await db.query.residents.findMany();
	const filteredResidents = isAdmin
		? residentsList
		: residentsList.filter((r) => userLocations.includes(r.location));

	const result = [];

	for (const resident of filteredResidents) {
		const plans = await db.query.fireEvac.findMany({
			where: eq(fireEvac.residentId, resident.id),
			orderBy: [desc(fireEvac.createdAt)],
			limit: 1,
		});

		if (plans.length > 0) {
			const plan = plans[0];
			const dueDate =
				(plan.createdAt?.getTime() || Date.now()) + 365 * 24 * 60 * 60 * 1000;
			const now = Date.now();
			const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

			let status = 'ok';
			if (daysUntilDue < 0) status = 'overdue';
			else if (daysUntilDue <= 30) status = 'due-soon';

			result.push({
				id: plan.id,
				residentId: resident.id,
				residentName: resident.name,
				location: resident.location,
				version: plan.version,
				lastUpload: plan.createdAt?.getTime() || Date.now(),
				nextDue: dueDate,
				status,
				fileName: plan.fileName,
				fileSize: plan.fileSize,
			});
		}
	}

	return result;
}

// Internal: List latest fire evac per resident (no auth)
export async function internalListLatestFireEvac() {
	const residentsList = await db.query.residents.findMany();
	const result = [];

	for (const resident of residentsList) {
		const plans = await db.query.fireEvac.findMany({
			where: eq(fireEvac.residentId, resident.id),
			orderBy: [desc(fireEvac.createdAt)],
			limit: 1,
		});

		if (plans.length > 0) {
			result.push({...plans[0], residentName: resident.name});
		}
	}
	return result;
}

// Internal: List alerts for location/type
export async function internalListAlertsForLocation(location: string, type: 'isp' | 'fire_evac') {
	return await db.query.complianceAlerts.findMany({
		where: and(eq(complianceAlerts.location, location), eq(complianceAlerts.type, type)),
	});
}

// Internal: List all active alerts
export async function internalListAllActiveAlerts() {
	return await db.query.complianceAlerts.findMany({
		where: eq(complianceAlerts.active, true),
		orderBy: [desc(complianceAlerts.createdAt)],
	});
}

// Internal: List all admins
export async function internalListAdmins() {
	const adminRoles = await db.query.roles.findMany({
		where: eq(roles.role, 'admin'),
	});
	const adminClerkUserIds = adminRoles.map((r) => r.clerkUserId).filter((id): id is string => id !== null);

	if (adminClerkUserIds.length === 0) {
		return [];
	}

	return await db.query.employees.findMany({
		where: inArray(employees.clerkUserId, adminClerkUserIds),
	});
}

// Query: List active alerts for user (by location)
export async function listActiveAlerts(clerkUserId: string) {
	const role = await getUserRoleDoc(clerkUserId);
	if (!role) return [];
	const locations = role.locations ?? [];
	const isAdmin = role.role === 'admin';

	if (isAdmin) {
		return await db.query.complianceAlerts.findMany({
			where: eq(complianceAlerts.active, true),
			orderBy: [desc(complianceAlerts.createdAt)],
		});
	}

	if (locations.length === 0) {
		return [];
	}

	return await db.query.complianceAlerts.findMany({
		where: and(eq(complianceAlerts.active, true), inArray(complianceAlerts.location, locations)),
		orderBy: [desc(complianceAlerts.createdAt)],
	});
}
