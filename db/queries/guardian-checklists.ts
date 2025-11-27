// src/db/queries/guardian-checklists.ts
import {db} from '../index';
import {
	guardianChecklistTemplates,
	guardianChecklistLinks,
	residents,
} from '../schema';
import {eq, desc, and} from 'drizzle-orm';
import {requireAdminOrSupervisorAccess} from '@/lib/db-helpers';

// List all checklist templates
export async function listChecklistTemplates(activeOnly?: boolean) {
	const query = db.query.guardianChecklistTemplates.findMany({
		orderBy: [desc(guardianChecklistTemplates.createdAt)],
	});

	const templates = await query;

	if (activeOnly) {
		return templates.filter((t) => t.active);
	}

	return templates;
}

// Get single checklist template
export async function getChecklistTemplate(templateId: string) {
	const template = await db.query.guardianChecklistTemplates.findFirst({
		where: eq(guardianChecklistTemplates.id, templateId),
	});

	if (!template) {
		throw new Error('Template not found');
	}

	return template;
}

// Get checklist by token (public - no auth required)
export async function getChecklistByToken(token: string) {
	const link = await db.query.guardianChecklistLinks.findFirst({
		where: eq(guardianChecklistLinks.token, token),
	});

	if (!link) {
		return null;
	}

	const template = await db.query.guardianChecklistTemplates.findFirst({
		where: eq(guardianChecklistTemplates.id, link.templateId),
	});

	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, link.residentId),
	});

	if (!template || !resident) {
		return null;
	}

	return {
		link,
		template,
		residentName: resident.name || 'Unknown',
		expired: link.expiresAt < new Date(),
		completed: link.completed,
	};
}

// List all checklist links (admin/supervisor)
export async function listChecklistLinks(
	clerkUserId: string,
	filters?: {
		residentId?: string;
		completedOnly?: boolean;
		pendingOnly?: boolean;
	}
) {
	await requireAdminOrSupervisorAccess(clerkUserId);

	let links = await db.query.guardianChecklistLinks.findMany({
		orderBy: [desc(guardianChecklistLinks.sentDate)],
	});

	// Filter by resident if specified
	if (filters?.residentId) {
		links = links.filter((link) => link.residentId === filters.residentId);
	}

	// Filter by completion status
	if (filters?.completedOnly) {
		links = links.filter((link) => link.completed);
	}
	if (filters?.pendingOnly) {
		links = links.filter((link) => !link.completed);
	}

	// Fetch related data
	const residentsList = await db.query.residents.findMany();
	const templates = await db.query.guardianChecklistTemplates.findMany();

	return links.map((link) => {
		const resident = residentsList.find((r) => r.id === link.residentId);
		const template = templates.find((t) => t.id === link.templateId);

		return {
			...link,
			residentName: resident?.name || 'Unknown',
			templateName: template?.name || 'Unknown',
			questions: template?.questions || [],
			expired: link.expiresAt < new Date(),
		};
	});
}

// Get checklist link details (admin/supervisor)
export async function getChecklistLink(clerkUserId: string, linkId: string) {
	await requireAdminOrSupervisorAccess(clerkUserId);

	const link = await db.query.guardianChecklistLinks.findFirst({
		where: eq(guardianChecklistLinks.id, linkId),
	});

	if (!link) {
		throw new Error('Link not found');
	}

	const template = await db.query.guardianChecklistTemplates.findFirst({
		where: eq(guardianChecklistTemplates.id, link.templateId),
	});

	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, link.residentId),
	});

	return {
		...link,
		residentName: resident?.name || 'Unknown',
		templateName: template?.name || 'Unknown',
		template,
		resident,
		expired: link.expiresAt < new Date(),
	};
}
