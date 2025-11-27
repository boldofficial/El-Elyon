// src/db/mutations/guardian-checklists.ts
import {db} from '../index';
import {
	guardianChecklistTemplates,
	guardianChecklistLinks,
	residents,
} from '../schema';
import {eq} from 'drizzle-orm';
import {
	requireAdminAccess,
	requireAdminOrSupervisorAccess,
} from '@/lib/db-helpers';
import {logAudit} from './audit';

// Create checklist template (admin only)
export async function createChecklistTemplate(
	clerkUserId: string,
	data: {
		name: string;
		description?: string;
		questions: Array<{
			id: string;
			text: string;
			type: 'yes_no' | 'text' | 'rating';
			required: boolean;
		}>;
	}
) {
	await requireAdminAccess(clerkUserId);

	const [template] = await db
		.insert(guardianChecklistTemplates)
		.values({
			name: data.name,
			description: data.description,
			questions: data.questions,
			createdBy: clerkUserId,
			createdAt: new Date(),
			active: true,
		})
		.returning();

	await logAudit({
		clerkUserId,
		event: 'create_checklist_template',
		details: `templateId=${template.id}`,
		deviceId: 'system',
		location: '',
	});

	return template;
}

// Update checklist template (admin only)
export async function updateChecklistTemplate(
	clerkUserId: string,
	templateId: string,
	data: {
		name?: string;
		description?: string;
		questions?: Array<{
			id: string;
			text: string;
			type: 'yes_no' | 'text' | 'rating';
			required: boolean;
		}>;
		active?: boolean;
	}
) {
	await requireAdminAccess(clerkUserId);

	const template = await db.query.guardianChecklistTemplates.findFirst({
		where: eq(guardianChecklistTemplates.id, templateId),
	});

	if (!template) {
		throw new Error('Template not found');
	}

	const [updated] = await db
		.update(guardianChecklistTemplates)
		.set({
			...data,
			updatedAt: new Date(),
			updatedBy: clerkUserId,
		})
		.where(eq(guardianChecklistTemplates.id, templateId))
		.returning();

	await logAudit({
		clerkUserId,
		event: 'update_checklist_template',
		details: `templateId=${templateId}`,
		deviceId: 'system',
		location: '',
	});

	return updated;
}

// Delete checklist template (admin only - soft delete)
export async function deleteChecklistTemplate(
	clerkUserId: string,
	templateId: string
) {
	await requireAdminAccess(clerkUserId);

	const template = await db.query.guardianChecklistTemplates.findFirst({
		where: eq(guardianChecklistTemplates.id, templateId),
	});

	if (!template) {
		throw new Error('Template not found');
	}

	await db
		.update(guardianChecklistTemplates)
		.set({
			active: false,
			updatedAt: new Date(),
			updatedBy: clerkUserId,
		})
		.where(eq(guardianChecklistTemplates.id, templateId));

	await logAudit({
		clerkUserId,
		event: 'delete_checklist_template',
		details: `templateId=${templateId}`,
		deviceId: 'system',
		location: '',
	});

	return {success: true};
}

// Send checklist to guardian (admin/supervisor)
export async function sendChecklistToGuardian(
	clerkUserId: string,
	data: {
		residentId: string;
		templateId: string;
		guardianEmail: string;
	}
) {
	await requireAdminOrSupervisorAccess(clerkUserId);

	// Verify resident exists
	const resident = await db.query.residents.findFirst({
		where: eq(residents.id, data.residentId),
	});

	if (!resident) {
		throw new Error('Resident not found');
	}

	// Verify template exists and is active
	const template = await db.query.guardianChecklistTemplates.findFirst({
		where: eq(guardianChecklistTemplates.id, data.templateId),
	});

	if (!template) {
		throw new Error('Template not found');
	}

	if (!template.active) {
		throw new Error('Template is not active');
	}

	// Generate unique token
	const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
	const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

	const [link] = await db
		.insert(guardianChecklistLinks)
		.values({
			residentId: data.residentId,
			templateId: data.templateId,
			guardianEmail: data.guardianEmail,
			token,
			sentDate: new Date(),
			expiresAt,
			completed: false,
			sentBy: clerkUserId,
		})
		.returning();

	await logAudit({
		clerkUserId,
		event: 'send_guardian_checklist',
		details: `linkId=${link.id}, guardianEmail=${data.guardianEmail}, residentId=${data.residentId}`,
		deviceId: 'system',
		location: '',
	});

	// Trigger email sending via API route
	// This will be called by the API route that uses this mutation
	return {linkId: link.id, token, success: true};
}

// Resend checklist to guardian (admin/supervisor)
export async function resendChecklistToGuardian(
	clerkUserId: string,
	linkId: string
) {
	await requireAdminOrSupervisorAccess(clerkUserId);

	const link = await db.query.guardianChecklistLinks.findFirst({
		where: eq(guardianChecklistLinks.id, linkId),
	});

	if (!link) {
		throw new Error('Link not found');
	}

	if (link.completed) {
		throw new Error('Checklist already completed');
	}

	// Extend expiration if expired
	const updates: any = {};
	if (link.expiresAt < new Date()) {
		updates.expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 more days
	}

	if (Object.keys(updates).length > 0) {
		await db
			.update(guardianChecklistLinks)
			.set(updates)
			.where(eq(guardianChecklistLinks.id, linkId));
	}

	await logAudit({
		clerkUserId,
		event: 'resend_guardian_checklist',
		details: `linkId=${linkId}`,
		deviceId: 'system',
		location: '',
	});

	return {success: true, token: link.token};
}

// Cancel/delete checklist link (admin/supervisor)
export async function cancelChecklistLink(clerkUserId: string, linkId: string) {
	await requireAdminOrSupervisorAccess(clerkUserId);

	const link = await db.query.guardianChecklistLinks.findFirst({
		where: eq(guardianChecklistLinks.id, linkId),
	});

	if (!link) {
		throw new Error('Link not found');
	}

	if (link.completed) {
		throw new Error('Cannot cancel completed checklist');
	}

	await db
		.delete(guardianChecklistLinks)
		.where(eq(guardianChecklistLinks.id, linkId));

	await logAudit({
		clerkUserId,
		event: 'cancel_guardian_checklist',
		details: `linkId=${linkId}`,
		deviceId: 'system',
		location: '',
	});

	return {success: true};
}
