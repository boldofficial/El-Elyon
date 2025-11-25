import {mutation, query, action} from './_generated/server';
import {v} from 'convex/values';
import {Id} from './_generated/dataModel'; // Re-added Id import
import {api, internal} from './_generated/api';
import {Resend} from 'resend';

const BASE_URL = process.env.VITE_CONVEX_URL || 'http://localhost:5173';
const API_KEY = process.env.RESEND_API_KEY;
const EMAIL_SENDER =
	process.env.FROM_EMAIL || 'Care App <noreply@care-app.convex.app>';

// Helper: Get user role doc
async function getUserRoleDoc(ctx: any, clerkUserId: string) {
	return await ctx.db
		.query('roles')
		.withIndex('by_clerkUserId', (q: any) => q.eq('clerkUserId', clerkUserId))
		.unique();
}

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

// Helper: Check if user has access to care functions
async function requireCareAccess(ctx: any, clerkUserId: string) {
	const userRole = await getUserRoleDoc(ctx, clerkUserId);
	if (!userRole || !['admin', 'supervisor', 'staff'].includes(userRole.role)) {
		await audit(ctx, 'access_denied', clerkUserId, 'care_access_required');
		throw new Error('Care access required');
	}
	return userRole;
}

// Helper: Check admin access
async function requireAdmin(ctx: any, clerkUserId: string) {
	const userRole = await getUserRoleDoc(ctx, clerkUserId);
	if (!userRole || userRole.role !== 'admin') {
		await audit(ctx, 'access_denied', clerkUserId, 'admin_required');
		throw new Error('Admin access required');
	}
	return userRole;
}

// Add new resident
export const addResident = mutation({
	args: {
		name: v.string(),
		location: v.string(),
		dateOfBirth: v.string(),
	},
	handler: async (ctx, {name, location, dateOfBirth}) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		await ctx.db.insert('residents', {
			name,
			location,
			dateOfBirth,
			createdBy: clerkUserId,
			createdAt: Date.now(),
		});

		await audit(ctx, 'add_resident', clerkUserId, `location=${location}`);
		return true;
	},
});

// --- ACTION: Send Employee Invite Email ---
export const sendEmployeeInviteEmail = action({
	args: {
		email: v.string(),
		name: v.string(),
		inviteUrl: v.string(),
		role: v.string(),
		locations: v.array(v.string()),
	},
	handler: async (ctx, {email, name, inviteUrl, role, locations}) => {
		// Use custom Resend API key if available, otherwise fall back to Convex proxy
		if (!API_KEY) {
			throw new Error('No Resend API key configured');
		}
		const resend = new Resend(API_KEY);

		const subject = "You're invited to join the Care App";
		const html = `
      <div>
        <h2>Hello ${name || 'there'},</h2>
        <p>You have been invited to join the Care App as a <b>${role}</b>.</p>
        <p>Assigned locations: <b>${locations.join(', ') || 'None'}</b></p>
        <p>
          <a href="${inviteUrl}" style="background:#2563eb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;">Accept your invite</a>
        </p>
        <p>If the button doesn't work, copy and paste this link into your browser:</p>
        <p><code>${inviteUrl}</code></p>
        <hr>
        <p>This invite will expire in 7 days.</p>
      </div>
    `;

		const {error} = await resend.emails.send({
			from: EMAIL_SENDER,
			to: email,
			subject,
			html,
		});

		if (error) {
			throw new Error('Failed to send invite email: ' + JSON.stringify(error));
		}
		return {success: true};
	},
});

// Query: Get employee invite link details
export const getEmployeeInviteLink = query({
	args: {
		employeeId: v.id('employees'),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdmin(ctx, clerkUserId); // Only admin can view invite links

		const employee = await ctx.db.get(args.employeeId);
		if (!employee) {
			return null;
		}

		if (!employee.inviteToken || !employee.inviteExpiresAt) {
			return null; // No active invite for this employee
		}

		// Reconstruct the invite URL
		const inviteUrl = `${BASE_URL}/?invite=${employee.inviteToken}`;

		return {
			url: inviteUrl,
			expiresAt: employee.inviteExpiresAt,
		};
	},
});

// Onboard new employee (admin only)
export const onboardEmployee = mutation({
	args: {
		name: v.string(),
		email: v.string(),
		role: v.union(
			v.literal('admin'),
			v.literal('supervisor'),
			v.literal('staff')
		),
		locations: v.array(v.string()),
	},
	handler: async (ctx, {name, email, role, locations}) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdmin(ctx, clerkUserId);

		// Generate secure invite token and expiration
		const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
		const expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7; // 7 days

		const employeeId = await ctx.db.insert('employees', {
			clerkUserId: token, // Use token as temporary clerkUserId
			name,
			workEmail: email,
			invitedAt: Date.now(),
			invitedBy: clerkUserId,
			hasAcceptedInvite: false,
			inviteToken: token,
			inviteExpiresAt: expiresAt,
			locations: locations,
		});

		// Create a role record for the employee with a temporary clerkUserId (token)
		await ctx.db.insert('roles', {
			clerkUserId: token,
			role: role,
			locations: locations,
			assignedBy: clerkUserId,
			assignedAt: Date.now(),
		});

		await audit(
			ctx,
			'send_employee_invite',
			clerkUserId,
			`employeeId=${employeeId},email=${email}`
		);

		// Build invite URL using the production deployment URL
		const inviteUrl = `${BASE_URL}/?invite=${token}`;

		// Send invite email via Resend action
		// NOTE: Mutations cannot call actions directly. The client should call sendEmployeeInviteEmail after onboarding.
		return {
			employeeId,
			inviteToken: token,
			inviteUrl,
			email,
			name,
			role,
			locations,
		};
	},
});

// List residents (care staff access)
export const listResidents = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		const residents = await ctx.db.query('residents').collect();
		return residents.map((resident) => ({
			id: resident._id,
			name: resident.name,
			location: resident.location,
			dateOfBirth: resident.dateOfBirth,
			createdBy: resident.createdBy,
			createdAt: resident.createdAt,
		}));
	},
});

// Create resident (care staff access)
export const createResident = mutation({
	args: {
		name: v.string(),
		location: v.string(),
		dateOfBirth: v.string(),
		guardians: v.optional(
			v.array(
				v.object({
					name: v.string(),
					email: v.string(),
					phone: v.string(),
					preferredChannel: v.string(),
				})
			)
		),
		generateChecklist: v.optional(v.boolean()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		const residentId = await ctx.db.insert('residents', {
			name: args.name,
			location: args.location,
			dateOfBirth: args.dateOfBirth,
			createdBy: clerkUserId,
			createdAt: Date.now(),
		});

		await audit(
			ctx,
			'create_resident',
			clerkUserId,
			`residentId=${residentId},location=${args.location}`
		);

		// Create guardians if provided
		const createdGuardianIds: Id<'guardians'>[] = [];
		if (args.guardians && args.guardians.length > 0) {
			for (const guardian of args.guardians) {
				if (
					guardian.name.trim() &&
					guardian.email.trim() &&
					guardian.phone.trim()
				) {
					const guardianId = await ctx.db.insert('guardians', {
						name: guardian.name.trim(),
						email: guardian.email.trim(),
						phone: guardian.phone.trim(),
						residentIds: [residentId],
						createdBy: clerkUserId,
						createdAt: Date.now(),
					});
					createdGuardianIds.push(guardianId);
					await audit(
						ctx,
						'create_guardian',
						clerkUserId,
						`guardianId=${guardianId}`
					);
				}
			}
		}

		// Generate checklist if requested
		if (args.generateChecklist && createdGuardianIds.length > 0) {
			// Get the default template
			const templates = await ctx.db
				.query('guardian_checklist_templates')
				.collect();
			const defaultTemplate = templates.find((t) => t.active) || templates[0];

			if (defaultTemplate) {
				for (const guardianId of createdGuardianIds) {
					const guardian = await ctx.db.get(guardianId);
					if (guardian && guardian.email) {
						const token =
							Math.random().toString(36).slice(2) + Date.now().toString(36);
						const expiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
						const linkId = await ctx.db.insert('guardian_checklist_links', {
							residentId,
							templateId: defaultTemplate._id,
							guardianEmail: guardian.email,
							token,
							sentDate: Date.now(),
							expiresAt,
							completed: false,
						});
						await ctx.scheduler.runAfter(
							0,
							internal.complianceEmails.sendGuardianChecklistEmail,
							{linkId, token}
						);
					}
				}
			}
		}

		return residentId;
	},
});

// List guardians (care staff access)
export const listGuardians = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		const guardians = await ctx.db.query('guardians').collect();
		const residents = await ctx.db.query('residents').collect();

		return guardians.map((guardian) => {
			const guardianResidents = residents.filter((r) =>
				guardian.residentIds?.includes(r._id)
			);

			return {
				id: guardian._id,
				name: guardian.name,
				email: guardian.email,
				phone: guardian.phone,
				relationship: guardian.relationship,
				address: guardian.address,
				residentIds: guardian.residentIds || [],
				residentNames: guardianResidents.map((r) => r.name),
				preferredChannel: 'email', // Default to email
				createdBy: guardian.createdBy,
				createdAt: guardian.createdAt,
			};
		});
	},
});

// Create guardian (care staff access)
export const createGuardian = mutation({
	args: {
		name: v.string(),
		email: v.string(),
		phone: v.string(),
		residentIds: v.array(v.id('residents')),
	},
	handler: async (ctx, {name, email, phone, residentIds}) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		const guardianId = await ctx.db.insert('guardians', {
			name,
			relationship: 'guardian',
			email,
			phone,
			residentIds,
			createdBy: clerkUserId,
			createdAt: Date.now(),
		});

		await audit(
			ctx,
			'create_guardian',
			clerkUserId,
			`guardianId=${guardianId},residentCount=${residentIds.length}`
		);
		return guardianId;
	},
});

// Update guardian (care staff access)
export const updateGuardian = mutation({
	args: {
		guardianId: v.id('guardians'),
		name: v.string(),
		email: v.string(),
		phone: v.string(),
		relationship: v.optional(v.string()),
		address: v.optional(v.string()),
		residentIds: v.array(v.id('residents')),
	},
	handler: async (
		ctx,
		{guardianId, name, email, phone, relationship, address, residentIds}
	) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		const guardian = await ctx.db.get(guardianId);
		if (!guardian) throw new Error('Guardian not found');

		await ctx.db.patch(guardianId, {
			name,
			email,
			phone,
			relationship,
			address,
			residentIds,
		});

		await audit(
			ctx,
			'update_guardian',
			clerkUserId,
			`guardianId=${guardianId}`
		);
		return guardianId;
	},
});

// Delete guardian (admin only) - CASCADE
export const deleteGuardian = mutation({
	args: {guardianId: v.id('guardians')},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdmin(ctx, clerkUserId);

		const guardian = await ctx.db.get(args.guardianId);
		if (!guardian) throw new Error('Guardian not found');

		// Remove guardianId from all residents' guardianIds arrays
		if (guardian.residentIds && guardian.residentIds.length > 0) {
			for (const residentId of guardian.residentIds) {
				const resident = await ctx.db.get(residentId);
				if (resident && resident.guardianIds) {
					const newGuardianIds = resident.guardianIds.filter(
						(id: Id<'guardians'>) => id !== args.guardianId
					);
					await ctx.db.patch(residentId, {guardianIds: newGuardianIds});
				}
			}
		}

		// Delete all guardian_checklist_links for this guardian (by email)
		const links = await ctx.db.query('guardian_checklist_links').collect();
		for (const link of links) {
			if (link.guardianEmail === guardian.email) {
				await ctx.db.delete(link._id);
			}
		}

		await ctx.db.delete(args.guardianId);
		await audit(
			ctx,
			'delete_guardian',
			clerkUserId,
			`guardianId=${args.guardianId}`
		);
		return {success: true};
	},
});

// Delete resident (admin only) - CASCADE
export const deleteResident = mutation({
	args: {residentId: v.id('residents')},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdmin(ctx, clerkUserId);

		const resident = await ctx.db.get(args.residentId);
		if (!resident) throw new Error('Resident not found');

		// 1. Delete all resident_logs
		const logs = await ctx.db
			.query('resident_logs')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.collect();
		for (const log of logs) {
			await ctx.db.delete(log._id);
		}

		// 2. Delete all audit_logs for this resident (by location or details)
		const audits = await ctx.db.query('audit_logs').collect();
		for (const auditLog of audits) {
			if (
				(auditLog.details && auditLog.details.includes(args.residentId)) ||
				(auditLog.location && auditLog.location === resident.location)
			) {
				await ctx.db.delete(auditLog._id);
			}
		}

		// 3. Delete all compliance_alerts for this resident's location
		const alerts = await ctx.db
			.query('compliance_alerts')
			.withIndex('by_location', (q) => q.eq('location', resident.location))
			.collect();
		for (const alert of alerts) {
			if (alert.metadata && alert.metadata.residentId === args.residentId) {
				await ctx.db.delete(alert._id);
			}
		}

		// 4. Delete all isp_files, isp, isp_access_logs, isp_acknowledgments
		const ispFiles = await ctx.db
			.query('isp_files')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.collect();
		for (const file of ispFiles) {
			await ctx.db.delete(file._id);
		}
		const isps = await ctx.db
			.query('isp')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.collect();
		for (const isp of isps) {
			await ctx.db.delete(isp._id);
		}
		const ispAccessLogs = await ctx.db
			.query('isp_access_logs')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.collect();
		for (const log of ispAccessLogs) {
			await ctx.db.delete(log._id);
		}
		const ispAcks = await ctx.db
			.query('isp_acknowledgments')
			.withIndex('by_resident_and_user', (q) =>
				q.eq('residentId', args.residentId)
			)
			.collect();
		for (const ack of ispAcks) {
			await ctx.db.delete(ack._id);
		}

		// 5. Delete all fire_evac plans for this resident
		const fireEvacs = await ctx.db
			.query('fire_evac')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.collect();
		for (const fe of fireEvacs) {
			await ctx.db.delete(fe._id);
		}

		// 6. Delete all guardian_checklist_links for this resident
		const checklistLinks = await ctx.db
			.query('guardian_checklist_links')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.collect();
		for (const link of checklistLinks) {
			await ctx.db.delete(link._id);
		}

		// 7. Remove residentId from all guardians' residentIds arrays
		const guardians = await ctx.db.query('guardians').collect();
		for (const guardian of guardians) {
			if (
				guardian.residentIds &&
				guardian.residentIds.includes(args.residentId)
			) {
				const newResidentIds = guardian.residentIds.filter(
					(id: Id<'residents'>) => id !== args.residentId
				);
				await ctx.db.patch(guardian._id, {residentIds: newResidentIds});
			}
		}

		await ctx.db.delete(args.residentId);
		await audit(
			ctx,
			'delete_resident',
			clerkUserId,
			`residentId=${args.residentId}`
		);
		return {success: true};
	},
});

// Generate upload URL for fire evac plan
export const generateFireEvacUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const userRole = await getUserRoleDoc(ctx, clerkUserId);
		if (!userRole || !['admin', 'supervisor'].includes(userRole.role)) {
			throw new Error(
				'Only admins and supervisors can upload fire evacuation plans'
			);
		}

		return await ctx.storage.generateUploadUrl();
	},
});
