import {
	query,
	mutation,
	action,
	internalQuery,
	internalMutation,
} from './_generated/server';
import {v} from 'convex/values';
// import { getAuthUserId } from "@convex-dev/auth/server"; // Removed as per plan
// import { Id } from "./_generated/dataModel"; // Removed as Id<"users"> is no longer used
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

// Internal: List all residents (no auth)
export const internalListResidents = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query('residents').collect();
	},
});

// Internal: List all ISP files for a resident (no auth)
export const internalListResidentISPFiles = internalQuery({
	args: {residentId: v.id('residents')},
	handler: async (ctx, {residentId}) => {
		return await ctx.db
			.query('isp_files')
			.withIndex('by_residentId', (q) => q.eq('residentId', residentId))
			.collect();
	},
});

// Internal: List latest fire evac per resident (no auth)
export const internalListLatestFireEvac = internalQuery({
	args: {},
	handler: async (ctx) => {
		const residents = await ctx.db.query('residents').collect();
		const result = [];

		for (const resident of residents) {
			const plans = await ctx.db
				.query('fire_evac')
				.withIndex('by_residentId', (q) => q.eq('residentId', resident._id))
				.order('desc')
				.take(1);

			if (plans.length > 0) {
				result.push({...plans[0], residentName: resident.name});
			}
		}

		return result;
	},
});

// Internal: List alerts for location/type
export const internalListAlertsForLocation = internalQuery({
	args: {
		location: v.string(),
		type: v.union(v.literal('isp'), v.literal('fire_evac')),
	},
	handler: async (ctx, {location, type}) => {
		return await ctx.db
			.query('compliance_alerts')
			.withIndex('by_location', (q) => q.eq('location', location))
			.collect()
			.then((alerts) => alerts.filter((a) => a.type === type));
	},
});

// Internal: Create alert
export const internalCreateAlert = internalMutation({
	args: {
		type: v.union(v.literal('isp'), v.literal('fire_evac')),
		location: v.string(),
		dueAt: v.number(),
		details: v.optional(v.string()),
	},
	handler: async (ctx, {type, location, dueAt, details}) => {
		await ctx.db.insert('compliance_alerts', {
			type,
			title: `${type} alert`,
			description: details || `${type} alert for ${location} due at ${dueAt}`,
			location,
			status: 'active',
			severity: 'medium',
			active: true,
			createdAt: Date.now(),
		});
		return true;
	},
});

// Internal: List all active alerts
export const internalListAllActiveAlerts = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query('compliance_alerts')
			.order('desc')
			.collect()
			.then((alerts) => alerts.filter((a) => a.active));
	},
});

// Internal: List all admins
export const internalListAdmins = internalQuery({
	args: {},
	handler: async (ctx) => {
		const roles = await ctx.db.query('roles').collect();
		const adminClerkUserIds = roles
			.filter((r: any) => r.role === 'admin')
			.map((r: any) => r.clerkUserId);
		const employees = [];
		for (const clerkUserId of adminClerkUserIds) {
			const employee = await ctx.db
				.query('employees')
				.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
				.unique();
			if (employee) employees.push(employee);
		}
		return employees;
	},
});

// Query: List active alerts for user (by location)
export const listActiveAlerts = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return [];
		const clerkUserId = identity.subject;
		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!role) return [];
		const locations = role.locations ?? [];
		return await ctx.db
			.query('compliance_alerts')
			.order('desc')
			.collect()
			.then((alerts) =>
				alerts.filter(
					(a) => a.active && a.location && locations.includes(a.location)
				)
			);
	},
});

// Mutation: Dismiss alert
export const dismissAlert = mutation({
	args: {alertId: v.id('compliance_alerts')},
	handler: async (ctx, {alertId}) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;
		const alert = await ctx.db.get(alertId);
		if (!alert || !alert.active) throw new Error('Alert not found');
		await ctx.db.patch(alertId, {
			active: false,
			dismissedBy: clerkUserId,
			dismissedAt: Date.now(),
		});
		await audit(
			ctx,
			'dismiss_alert',
			clerkUserId,
			`alertId=${alertId},type=${alert.type},location=${alert.location}`
		);
		return true;
	},
});

// Mutation: Admin sets alert schedule
export const setAlertSchedule = mutation({
	args: {weekday: v.number(), hour: v.number(), minute: v.number()},
	handler: async (ctx, {weekday, hour, minute}) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;
		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!role || role.role !== 'admin') throw new Error('Forbidden');
		const config = await ctx.db.query('config').first();
		if (config) {
			await ctx.db.patch(config._id, {
				alertWeekday: weekday,
				alertHour: hour,
				alertMinute: minute,
			});
		}
		await audit(
			ctx,
			'set_alert_schedule',
			clerkUserId,
			`weekday=${weekday},hour=${hour},minute=${minute}`
		);
		return true;
	},
});

// Mutation: Generate upload URL for fire evac plan
export const generateFireEvacUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;
		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!role || (role.role !== 'admin' && role.role !== 'supervisor')) {
			throw new Error(
				'Forbidden: Only admins and supervisors can upload fire evacuation plans'
			);
		}
		return await ctx.storage.generateUploadUrl();
	},
});

// Mutation: Admin/Supervisor uploads Fire Evac plan (DEPRECATED - use fireEvac.ts)
export const uploadFireEvac = mutation({
	args: {
		location: v.string(),
		fileStorageId: v.id('_storage'),
		fileName: v.string(),
		fileSize: v.number(),
		contentType: v.string(),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;
		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!role || (role.role !== 'admin' && role.role !== 'supervisor')) {
			throw new Error(
				'Forbidden: Only admins and supervisors can upload fire evacuation plans'
			);
		}

		throw new Error(
			'DEPRECATED: Use fireEvac.saveResidentFireEvacPlan instead'
		);
	},
});

// Mutation: When ISP is published, set due +6mo (called from existing publishIsp)
export const setIspDueDate = mutation({
	args: {residentId: v.id('residents'), ispId: v.id('isp')},
	handler: async (ctx, {residentId, ispId}) => {
		const dueAt = Date.now() + 1000 * 60 * 60 * 24 * 30 * 6;
		await ctx.db.patch(ispId, {dueAt});
		await audit(
			ctx,
			'set_isp_due_date',
			null,
			`ispId=${ispId} dueAt=${dueAt} residentId=${residentId}`
		);
		return true;
	},
});

// --- NEW: Get compliance overview for workspace ---
export const getComplianceOverview = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!role) throw new Error('Forbidden');

		const userLocations = role.locations ?? [];
		const isAdmin = role.role === 'admin';

		if (!isAdmin && userLocations.length === 0) {
			return [];
		}

		const items = [];

		// Get ISP items from new isp_files table - filter by user"s locations
		const allResidents = await ctx.db.query('residents').collect();
		const filteredResidents = isAdmin
			? allResidents
			: allResidents.filter((r) => userLocations.includes(r.location));

		for (const resident of filteredResidents) {
			const ispFiles = await ctx.db
				.query('isp_files')
				.withIndex('by_residentId', (q) => q.eq('residentId', resident._id))
				.collect();

			const activeISP = ispFiles.find((f) => f.status === 'active');
			if (activeISP) {
				const dueDate = activeISP.effectiveDate + 6 * 30 * 24 * 60 * 60 * 1000;
				const now = Date.now();
				const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

				let status = 'ok';
				if (daysUntilDue < 0) status = 'overdue';
				else if (daysUntilDue <= 30) status = 'due-soon';

				items.push({
					id: `isp-${resident._id}`,
					location: resident.location,
					type: 'isp',
					itemName: `ISP - ${resident.name}`,
					description: `${activeISP.versionLabel}`,
					dueDate,
					status,
					lastAction: `Activated ${new Date(activeISP.activatedAt || activeISP.uploadedAt).toLocaleDateString()}`,
					residentId: resident._id,
					residentName: resident.name,
				});
			} else if (ispFiles.length === 0) {
				items.push({
					id: `isp-${resident._id}`,
					location: resident.location,
					type: 'isp',
					itemName: `ISP - ${resident.name}`,
					description: 'No ISP on file',
					dueDate: Date.now(),
					status: 'overdue',
					lastAction: 'Never uploaded',
					residentId: resident._id,
					residentName: resident.name,
				});
			}
		}

		// Get Fire Evac items - now per resident
		for (const resident of filteredResidents) {
			const fireEvacPlans = await ctx.db
				.query('fire_evac')
				.withIndex('by_residentId', (q) => q.eq('residentId', resident._id))
				.order('desc')
				.take(1);

			const latestPlan = fireEvacPlans[0];

			if (latestPlan) {
				const dueDate =
					(latestPlan.createdAt || Date.now()) + 365 * 24 * 60 * 60 * 1000;
				const now = Date.now();
				const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

				let status = 'ok';
				if (daysUntilDue < 0) status = 'overdue';
				else if (daysUntilDue <= 30) status = 'due-soon';

				items.push({
					id: `fire-evac-${resident._id}`,
					location: resident.location,
					type: 'fire_evac',
					itemName: `Fire Evac - ${resident.name}`,
					description: `Version ${latestPlan.version}`,
					dueDate,
					status,
					lastAction: `Uploaded ${new Date(latestPlan.createdAt || Date.now()).toLocaleDateString()}`,
					residentId: resident._id,
					residentName: resident.name,
				});
			} else {
				items.push({
					id: `fire-evac-${resident._id}`,
					location: resident.location,
					type: 'fire_evac',
					itemName: `Fire Evac - ${resident.name}`,
					description: 'No plan on file',
					dueDate: Date.now(),
					status: 'overdue',
					lastAction: 'Never uploaded',
					residentId: resident._id,
					residentName: resident.name,
				});
			}
		}

		return items;
	},
});

// --- NEW: Get guardian checklist links ---
export const getGuardianChecklistLinks = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!role) throw new Error('Forbidden');

		const userLocations = role.locations ?? [];
		const isAdmin = role.role === 'admin';

		const links = await ctx.db.query('guardian_checklist_links').collect();
		const residents = await ctx.db.query('residents').collect();
		const templates = await ctx.db
			.query('guardian_checklist_templates')
			.collect();

		const result = [];

		for (const link of links) {
			const resident = residents.find((r) => r._id === link.residentId);
			if (!resident) continue;

			if (!isAdmin && !userLocations.includes(resident.location)) continue;

			const template = templates.find((t) => t._id === link.templateId);
			const now = Date.now();

			result.push({
				id: link._id,
				location: resident.location,
				templateName: template?.name || 'Unknown Template',
				completed: link.completed,
				expired: link.expiresAt < now,
				sentDate: link.sentDate,
				expiresAt: link.expiresAt,
			});
		}

		return result;
	},
});

// --- NEW: Get fire evacuation plans ---
export const getFireEvacPlans = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!role) throw new Error('Forbidden');

		const userLocations = role.locations ?? [];
		const isAdmin = role.role === 'admin';

		const residents = await ctx.db.query('residents').collect();
		const filteredResidents = isAdmin
			? residents
			: residents.filter((r) => userLocations.includes(r.location));

		const result = [];

		for (const resident of filteredResidents) {
			const plans = await ctx.db
				.query('fire_evac')
				.withIndex('by_residentId', (q) => q.eq('residentId', resident._id))
				.order('desc')
				.take(1);

			if (plans.length > 0) {
				const plan = plans[0];
				const dueDate =
					(plan.createdAt || Date.now()) + 365 * 24 * 60 * 60 * 1000;
				const now = Date.now();
				const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

				let status = 'ok';
				if (daysUntilDue < 0) status = 'overdue';
				else if (daysUntilDue <= 30) status = 'due-soon';

				result.push({
					id: plan._id,
					residentId: resident._id,
					residentName: resident.name,
					location: resident.location,
					version: plan.version,
					lastUpload: plan.createdAt || Date.now(),
					nextDue: dueDate,
					status,
					fileName: plan.fileName,
					fileSize: plan.fileSize,
				});
			}
		}

		return result;
	},
});

// --- NEW: Send compliance reminders ---
export const sendComplianceReminders = mutation({
	args: {itemIds: v.array(v.string())},
	handler: async (ctx, {itemIds}) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await audit(
			ctx,
			'send_compliance_reminders',
			clerkUserId,
			`itemCount=${itemIds.length}`
		);

		// Schedule email action
		await ctx.scheduler.runAfter(
			0,
			internal.complianceEmails.sendComplianceReminderEmails,
			{
				itemIds,
				clerkUserId,
			}
		);

		return {sent: itemIds.length};
	},
});

// --- NEW: Export compliance list ---
export const exportComplianceList = mutation({
	args: {itemIds: v.array(v.string())},
	handler: async (ctx, {itemIds}) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const role = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.unique();
		if (!role || role.role !== 'admin') throw new Error('Forbidden');

		await audit(
			ctx,
			'export_compliance_list',
			clerkUserId,
			`itemCount=${itemIds.length}`
		);

		return {exported: itemIds.length};
	},
});

// --- NEW: Resend guardian checklist link ---
export const resendGuardianLink = mutation({
	args: {linkId: v.id('guardian_checklist_links')},
	handler: async (ctx, {linkId}) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const link = await ctx.db.get(linkId);
		if (!link) throw new Error('Link not found');

		const newExpiresAt = Date.now() + 30 * 24 * 60 * 60 * 1000;
		await ctx.db.patch(linkId, {expiresAt: newExpiresAt});

		await audit(ctx, 'resend_guardian_link', clerkUserId, `linkId=${linkId}`);

		// Schedule email action
		await ctx.scheduler.runAfter(
			0,
			internal.complianceEmails.sendGuardianChecklistEmail,
			{
				linkId,
				token: link.token,
			}
		);

		return {linkId, token: link.token};
	},
});

// Action: Generate alerts (called on schedule)
export const generateComplianceAlerts = action({
	args: {},
	handler: async (ctx) => {
		const residents = await ctx.runQuery(
			internal.compliance.internalListResidents,
			{}
		);
		for (const resident of residents) {
			const ispFiles = await ctx.runQuery(
				internal.compliance.internalListResidentISPFiles,
				{residentId: resident._id}
			);
			const activeISP = ispFiles.find((f: any) => f.status === 'active');
			if (activeISP) {
				const dueAt = activeISP.effectiveDate + 6 * 30 * 24 * 60 * 60 * 1000;
				if (dueAt - Date.now() <= 1000 * 60 * 60 * 24 * 30) {
					const alerts = await ctx.runQuery(
						internal.compliance.internalListAlertsForLocation,
						{location: resident.location, type: 'isp'}
					);
					const alreadyActive = alerts.some(
						(a: any) => a.active && a.dueAt === dueAt
					);
					if (!alreadyActive) {
						await ctx.runMutation(internal.compliance.internalCreateAlert, {
							type: 'isp',
							location: resident.location,
							dueAt,
							details: `ISP due soon for resident(s) at ${resident.location}`,
						});
					}
				}
			}
		}

		// Fire Evac alerts - now per resident
		const fireEvacs = await ctx.runQuery(
			internal.compliance.internalListLatestFireEvac,
			{}
		);
		for (const fe of fireEvacs) {
			const location = fe.location || 'unknown';
			const dueAt = (fe.createdAt || Date.now()) + 365 * 24 * 60 * 60 * 1000;
			if (dueAt - Date.now() <= 1000 * 60 * 60 * 24 * 30) {
				const alerts = await ctx.runQuery(
					internal.compliance.internalListAlertsForLocation,
					{location, type: 'fire_evac'}
				);
				const alreadyActive = alerts.some(
					(a: any) => a.active && a.dueAt === dueAt
				);
				if (!alreadyActive) {
					await ctx.runMutation(internal.compliance.internalCreateAlert, {
						type: 'fire_evac',
						location,
						dueAt,
						details: `Fire Evac plan due soon for ${fe.residentName}`,
					});
				}
			}
		}
		return true;
	},
});

// Action: Send alert emails (no PHI, just links)
import {Resend} from 'resend';
export const sendAlertEmails = action({
	args: {},
	handler: async (ctx) => {
		const alerts = await ctx.runQuery(
			internal.compliance.internalListAllActiveAlerts,
			{}
		);
		const admins = (await ctx.runQuery(
			internal.compliance.internalListAdmins,
			{}
		)) as any[];
		// Use custom Resend API key if available, otherwise fall back to Convex proxy
		const apiKey =
			process.env.RESEND_API_KEY || process.env.CONVEX_RESEND_API_KEY;
		if (!apiKey) {
			throw new Error('No Resend API key configured');
		}
		const resend = new Resend(apiKey);
		const fromEmail =
			process.env.FROM_EMAIL ||
			'Compliance System <noreply@compliance.example.com>';
		const baseUrl =
			process.env.SITE_URL ||
			process.env.CONVEX_SITE_URL ||
			'https://yourdomain.com';

		for (const alert of alerts) {
			for (const admin of admins) {
				if (!admin || typeof admin.workEmail !== 'string') continue;
				await resend.emails.send({
					from: fromEmail,
					to: admin.workEmail,
					subject: `Compliance Alert: ${alert.type.toUpperCase()} due soon`,
					html: `<p>A compliance item (${alert.type}) is due soon for location: ${alert.location}.</p>
          <p><a href="${baseUrl}/?view=compliance">View details in the compliance dashboard (secure login required)</a></p>`,
				});
			}
		}
		return true;
	},
});
