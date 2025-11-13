import {query, mutation, internalQuery} from './_generated/server';
import {v} from 'convex/values';
import {internal} from './_generated/api';

// Helper: Audit
async function audit(
	ctx: any,
	event: string,
	clerkUserId: string | null,
	details?: string
) {
	await ctx.db.insert('audit_logs', {
		clerkUserId: clerkUserId ?? undefined,
		event,
		timestamp: Date.now(),
		deviceId: 'system',
		location: '',
		details,
	});
}

// Helper: Get user role
async function getUserRole(ctx: any, clerkUserId: string) {
	const roleDoc = await ctx.db
		.query('roles')
		.withIndex('by_clerkUserId', (q: any) => q.eq('clerkUserId', clerkUserId))
		.unique();
	return roleDoc?.role || null;
}

// Helper: Require admin access
async function requireAdmin(ctx: any, clerkUserId: string) {
	const role = await getUserRole(ctx, clerkUserId);
	if (!role || role !== 'admin') {
		throw new Error('Admin access required');
	}
	return role;
}

// Helper: Require admin or supervisor access
async function requireAdminOrSupervisor(ctx: any, clerkUserId: string) {
	const role = await getUserRole(ctx, clerkUserId);
	if (!role || !['admin', 'supervisor'].includes(role)) {
		throw new Error('Admin or supervisor access required');
	}
	return role;
}

// Create checklist template (admin only)
export const createChecklistTemplate = mutation({
	args: {
		name: v.string(),
		description: v.optional(v.string()),
		questions: v.array(
			v.object({
				id: v.string(),
				text: v.string(),
				type: v.union(
					v.literal('yes_no'),
					v.literal('text'),
					v.literal('rating')
				),
				required: v.boolean(),
			})
		),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdmin(ctx, clerkUserId);

		const templateId = await ctx.db.insert('guardian_checklist_templates', {
			name: args.name,
			description: args.description,
			questions: args.questions,
			createdBy: clerkUserId,
			createdAt: Date.now(),
			active: true,
		});

		await audit(
			ctx,
			'create_checklist_template',
			clerkUserId,
			`templateId=${templateId}`
		);
		return templateId;
	},
});

// Update checklist template (admin only)
export const updateChecklistTemplate = mutation({
	args: {
		templateId: v.id('guardian_checklist_templates'),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		questions: v.optional(
			v.array(
				v.object({
					id: v.string(),
					text: v.string(),
					type: v.union(
						v.literal('yes_no'),
						v.literal('text'),
						v.literal('rating')
					),
					required: v.boolean(),
				})
			)
		),
		active: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdmin(ctx, clerkUserId);

		const template = await ctx.db.get(args.templateId);
		if (!template) throw new Error('Template not found');

		const updates: any = {
			updatedAt: Date.now(),
			updatedBy: clerkUserId,
		};

		if (args.name !== undefined) updates.name = args.name;
		if (args.description !== undefined) updates.description = args.description;
		if (args.questions !== undefined) updates.questions = args.questions;
		if (args.active !== undefined) updates.active = args.active;

		await ctx.db.patch(args.templateId, updates);

		await audit(
			ctx,
			'update_checklist_template',
			clerkUserId,
			`templateId=${args.templateId}`
		);

		return {success: true};
	},
});

// Delete checklist template (admin only - soft delete)
export const deleteChecklistTemplate = mutation({
	args: {
		templateId: v.id('guardian_checklist_templates'),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdmin(ctx, clerkUserId);

		const template = await ctx.db.get(args.templateId);
		if (!template) throw new Error('Template not found');

		await ctx.db.patch(args.templateId, {
			active: false,
			updatedAt: Date.now(),
			updatedBy: clerkUserId,
		});

		await audit(
			ctx,
			'delete_checklist_template',
			clerkUserId,
			`templateId=${args.templateId}`
		);

		return {success: true};
	},
});

// List all checklist templates
export const listChecklistTemplates = query({
	args: {
		activeOnly: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		let templates = await ctx.db
			.query('guardian_checklist_templates')
			.collect();

		// Filter by active status if requested
		if (args.activeOnly) {
			templates = templates.filter((t) => t.active);
		}

		// Sort by creation date (newest first)
		return templates.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
	},
});

// Get single checklist template
export const getChecklistTemplate = query({
	args: {
		templateId: v.id('guardian_checklist_templates'),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		const template = await ctx.db.get(args.templateId);
		if (!template) throw new Error('Template not found');

		return template;
	},
});

// Send checklist to guardian (admin/supervisor)
export const sendChecklistToGuardian = mutation({
	args: {
		residentId: v.id('residents'),
		templateId: v.id('guardian_checklist_templates'),
		guardianEmail: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdminOrSupervisor(ctx, clerkUserId);

		// Verify resident exists
		const resident = await ctx.db.get(args.residentId);
		if (!resident) throw new Error('Resident not found');

		// Verify template exists and is active
		const template = await ctx.db.get(args.templateId);
		if (!template) throw new Error('Template not found');
		if (!template.active) throw new Error('Template is not active');

		// Generate unique token
		const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
		const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days

		const linkId = await ctx.db.insert('guardian_checklist_links', {
			residentId: args.residentId,
			templateId: args.templateId,
			guardianEmail: args.guardianEmail,
			token,
			sentDate: Date.now(),
			expiresAt,
			completed: false,
			sentBy: clerkUserId,
		});

		await audit(
			ctx,
			'send_guardian_checklist',
			clerkUserId,
			`linkId=${linkId}, guardianEmail=${args.guardianEmail}, residentId=${args.residentId}`
		);

		// Schedule email action
		await ctx.scheduler.runAfter(
			0,
			internal.complianceEmails.sendGuardianChecklistEmail,
			{
				linkId,
				token,
			}
		);

		return {linkId, token, success: true};
	},
});

// Resend checklist to guardian (admin/supervisor)
export const resendChecklistToGuardian = mutation({
	args: {
		linkId: v.id('guardian_checklist_links'),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdminOrSupervisor(ctx, clerkUserId);

		const link = await ctx.db.get(args.linkId);
		if (!link) throw new Error('Link not found');
		if (link.completed) throw new Error('Checklist already completed');

		// Extend expiration if expired
		const updates: any = {};
		if (link.expiresAt < Date.now()) {
			updates.expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 more days
		}

		if (Object.keys(updates).length > 0) {
			await ctx.db.patch(args.linkId, updates);
		}

		await audit(
			ctx,
			'resend_guardian_checklist',
			clerkUserId,
			`linkId=${args.linkId}`
		);

		// Schedule email action
		await ctx.scheduler.runAfter(
			0,
			internal.complianceEmails.sendGuardianChecklistEmail,
			{
				linkId: args.linkId,
				token: link.token,
			}
		);

		return {success: true};
	},
});

// Get checklist by token (public - no auth required)
export const getChecklistByToken = query({
	args: {token: v.string()},
	handler: async (ctx, {token}) => {
		const link = await ctx.db
			.query('guardian_checklist_links')
			.withIndex('by_token', (q) => q.eq('token', token))
			.unique();

		if (!link) return null;

		const template = await ctx.db.get(link.templateId);
		const resident = await ctx.db.get(link.residentId);

		if (!template || !resident) return null;

		return {
			link,
			template,
			residentName: resident.name || 'Unknown',
			expired: link.expiresAt < Date.now(),
			completed: link.completed,
		};
	},
});

// Submit checklist responses (public - no auth required)
export const submitChecklistResponses = mutation({
	args: {
		token: v.string(),
		responses: v.array(
			v.object({
				questionId: v.string(),
				answer: v.union(v.string(), v.number(), v.boolean()),
			})
		),
	},
	handler: async (ctx, {token, responses}) => {
		const link = await ctx.db
			.query('guardian_checklist_links')
			.withIndex('by_token', (q) => q.eq('token', token))
			.unique();

		if (!link) throw new Error('Invalid link');
		if (link.completed) throw new Error('Checklist already completed');
		if (link.expiresAt < Date.now()) throw new Error('Link expired');

		// Validate that all required questions are answered
		const template = await ctx.db.get(link.templateId);
		if (!template) throw new Error('Template not found');

		const requiredQuestionIds = template.questions
			.filter((q) => q.required)
			.map((q) => q.id);
		const answeredQuestionIds = responses.map((r) => r.questionId);

		const missingRequired = requiredQuestionIds.filter(
			(id) => !answeredQuestionIds.includes(id)
		);

		if (missingRequired.length > 0) {
			throw new Error('All required questions must be answered');
		}

		await ctx.db.patch(link._id, {
			completed: true,
			completedAt: Date.now(),
			responses,
		});

		// Audit this action (no clerkUserId available for public mutation)
		await audit(
			ctx,
			'submit_guardian_checklist',
			null,
			`linkId=${link._id}, guardianEmail=${link.guardianEmail}`
		);

		return {success: true};
	},
});

// List all checklist links (admin/supervisor)
export const listChecklistLinks = query({
	args: {
		residentId: v.optional(v.id('residents')),
		completedOnly: v.optional(v.boolean()),
		pendingOnly: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdminOrSupervisor(ctx, clerkUserId);

		let links = await ctx.db.query('guardian_checklist_links').collect();

		// Filter by resident if specified
		if (args.residentId) {
			links = links.filter((link) => link.residentId === args.residentId);
		}

		// Filter by completion status
		if (args.completedOnly) {
			links = links.filter((link) => link.completed);
		}
		if (args.pendingOnly) {
			links = links.filter((link) => !link.completed);
		}

		const residents = await ctx.db.query('residents').collect();
		const templates = await ctx.db
			.query('guardian_checklist_templates')
			.collect();

		return links
			.map((link) => {
				const resident = residents.find((r) => r._id === link.residentId);
				const template = templates.find((t) => t._id === link.templateId);

				return {
					...link,
					residentName: resident?.name || 'Unknown',
					templateName: template?.name || 'Unknown',
					questions: template?.questions || [],
					expired: link.expiresAt < Date.now(),
				};
			})
			.sort((a, b) => (b.sentDate || 0) - (a.sentDate || 0)); // Sort by sent date (newest first)
	},
});

// Get checklist link details (admin/supervisor)
export const getChecklistLink = query({
	args: {
		linkId: v.id('guardian_checklist_links'),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdminOrSupervisor(ctx, clerkUserId);

		const link = await ctx.db.get(args.linkId);
		if (!link) throw new Error('Link not found');

		const template = await ctx.db.get(link.templateId);
		const resident = await ctx.db.get(link.residentId);

		return {
			...link,
			residentName: resident?.name || 'Unknown',
			templateName: template?.name || 'Unknown',
			template,
			resident,
			expired: link.expiresAt < Date.now(),
		};
	},
});

// Cancel/delete checklist link (admin/supervisor)
export const cancelChecklistLink = mutation({
	args: {
		linkId: v.id('guardian_checklist_links'),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdminOrSupervisor(ctx, clerkUserId);

		const link = await ctx.db.get(args.linkId);
		if (!link) throw new Error('Link not found');
		if (link.completed) throw new Error('Cannot cancel completed checklist');

		await ctx.db.delete(args.linkId);

		await audit(
			ctx,
			'cancel_guardian_checklist',
			clerkUserId,
			`linkId=${args.linkId}`
		);

		return {success: true};
	},
});

// Internal query for email action
export const internalGetChecklistLink = internalQuery({
	args: {linkId: v.id('guardian_checklist_links')},
	handler: async (ctx, {linkId}) => {
		const link = await ctx.db.get(linkId);
		if (!link) return null;

		const template = await ctx.db.get(link.templateId);
		const resident = await ctx.db.get(link.residentId);

		return {
			link,
			template,
			resident,
		};
	},
});
