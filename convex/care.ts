import {mutation, query} from './_generated/server';
import {v} from 'convex/values';
// import { Id } from "./_generated/dataModel"; // Removed as Id<"users"> is no longer used

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

// Helper: Check if user has care access
async function requireCareAccess(ctx: any, clerkUserId: string) {
	const userRole = await getUserRoleDoc(ctx, clerkUserId);
	if (
		!userRole ||
		!userRole.role ||
		!['admin', 'supervisor', 'staff'].includes(userRole.role)
	) {
		await audit(ctx, 'access_denied', clerkUserId, 'care_access_required');
		throw new Error('Care access required');
	}
	return userRole;
}

// Query: Get residents for current user's locations
export const getMyResidents = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const userRole = await requireCareAccess(ctx, clerkUserId);

		// Admin can see all residents
		if (userRole.role === 'admin') {
			const residents = await ctx.db.query('residents').collect();
			return residents.map((resident) => ({
				id: resident._id,
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

		const residents = await ctx.db.query('residents').collect();
		const filteredResidents = residents.filter((resident) =>
			userLocations.includes(resident.location)
		);

		return filteredResidents.map((resident) => ({
			id: resident._id,
			name: resident.name,
			location: resident.location,
			dob: resident.dateOfBirth,
			createdAt: resident.createdAt,
		}));
	},
});

// Query: Get resident logs for locations accessible to current user
export const getResidentLogs = query({
	args: {
		residentId: v.optional(v.id('residents')),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const userRole = await requireCareAccess(ctx, clerkUserId);
		const userLocations =
			userRole.role === 'admin' ? [] : userRole.locations || [];

		let logs;

		if (args.residentId) {
			// Get logs for specific resident
			const resident = await ctx.db.get(args.residentId);
			if (!resident) throw new Error('Resident not found');

			// Check if user has access to this resident's location
			if (
				userRole.role !== 'admin' &&
				!userLocations.includes(resident.location)
			) {
				throw new Error("Access denied to this resident's logs");
			}

			logs = await ctx.db
				.query('resident_logs')
				.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId!))
				.order('desc')
				.take(args.limit || 50);
		} else {
			// Get all logs for user's accessible locations
			const allLogs = await ctx.db
				.query('resident_logs')
				.order('desc')
				.take(args.limit || 100);

			if (userRole.role === 'admin') {
				logs = allLogs;
			} else {
				// Filter logs by accessible residents
				const residents = await ctx.db.query('residents').collect();
				const accessibleResidentIds = residents
					.filter((r) => userLocations.includes(r.location))
					.map((r) => r._id);

				logs = allLogs.filter((log) =>
					accessibleResidentIds.includes(log.residentId)
				);
			}
		}

		// Get additional data for each log
		const employees = await ctx.db.query('employees').collect();
		const residents = await ctx.db.query('residents').collect();

		const enrichedLogs = await Promise.all(
			logs.map(async (log) => {
				const author = employees.find((e) => e.clerkUserId === log.authorId);
				const resident = residents.find((r) => r._id === log.residentId);

				return {
					id: log._id,
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
	},
});

// Query: Get recent logs summary for dashboard
export const getRecentLogsSummary = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const userRole = await requireCareAccess(ctx, clerkUserId);
		const userLocations =
			userRole.role === 'admin' ? [] : userRole.locations || [];

		// Get logs from last 7 days
		const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
		const recentLogs = await ctx.db
			.query('resident_logs')
			.filter((q) => q.gt(q.field('createdAt'), sevenDaysAgo))
			.order('desc')
			.take(100);

		let filteredLogs = recentLogs;

		if (userRole.role !== 'admin') {
			// Filter by accessible locations
			const residents = await ctx.db.query('residents').collect();
			const accessibleResidentIds = residents
				.filter((r) => userLocations.includes(r.location))
				.map((r) => r._id);

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

		const residents = await ctx.db.query('residents').collect();

		filteredLogs.forEach((log) => {
			const resident = residents.find((r) => r._id === log.residentId);
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
	},
});

// Mutation: Create resident log
export const createResidentLog = mutation({
	args: {
		residentId: v.id('residents'),
		template: v.string(),
		content: v.string(),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const userRole = await requireCareAccess(ctx, clerkUserId);

		// Check if resident exists and user has access
		const resident = await ctx.db.get(args.residentId);
		if (!resident) throw new Error('Resident not found');

		const userLocations =
			userRole.role === 'admin' ? [] : userRole.locations || [];
		if (
			userRole.role !== 'admin' &&
			!userLocations.includes(resident.location)
		) {
			throw new Error('Access denied to create logs for this resident');
		}

		// Get the next version number for this resident
		const existingLogs = await ctx.db
			.query('resident_logs')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.collect();

		const nextVersion =
			Math.max(
				0,
				...existingLogs.map((log) =>
					typeof log.version === 'number' ? log.version : 0
				)
			) + 1;

		const logId = await ctx.db.insert('resident_logs', {
			residentId: args.residentId,
			authorId: clerkUserId,
			version: nextVersion,
			template: args.template,
			content: args.content,
			location: resident.location,
			createdAt: Date.now(),
		});

		await audit(
			ctx,
			'create_resident_log',
			clerkUserId,
			`residentId=${args.residentId},template=${args.template},version=${nextVersion}`
		);

		return logId;
	},
});

// Query: Get log templates
export const getLogTemplates = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

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
	},
});

// Query: Search logs
export const searchLogs = query({
	args: {
		query: v.string(),
		residentId: v.optional(v.id('residents')),
		template: v.optional(v.string()),
		dateFrom: v.optional(v.number()),
		dateTo: v.optional(v.number()),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const userRole = await requireCareAccess(ctx, clerkUserId);
		const userLocations =
			userRole.role === 'admin' ? [] : userRole.locations || [];

		let logs = await ctx.db
			.query('resident_logs')
			.order('desc')
			.take(args.limit || 100);

		// Filter by user's accessible locations
		if (userRole.role !== 'admin') {
			const residents = await ctx.db.query('residents').collect();
			const accessibleResidentIds = residents
				.filter((r) => userLocations.includes(r.location))
				.map((r) => r._id);

			logs = logs.filter((log) =>
				accessibleResidentIds.includes(log.residentId)
			);
		}

		// Apply filters
		if (args.residentId) {
			logs = logs.filter((log) => log.residentId === args.residentId);
		}

		if (args.template) {
			logs = logs.filter((log) => log.template === args.template);
		}

		if (args.dateFrom) {
			logs = logs.filter(
				(log) => log.createdAt && log.createdAt >= args.dateFrom!
			);
		}

		if (args.dateTo) {
			logs = logs.filter(
				(log) => log.createdAt && log.createdAt <= args.dateTo!
			);
		}

		// Search in content
		if (args.query.trim()) {
			const searchTerm = args.query.toLowerCase();
			logs = logs.filter(
				(log) =>
					log.content.toLowerCase().includes(searchTerm) ||
					log.template?.toLowerCase().includes(searchTerm)
			);
		}

		// Enrich with additional data
		const employees = await ctx.db.query('employees').collect();
		const residents = await ctx.db.query('residents').collect();

		const enrichedLogs = logs.map((log) => {
			const author = employees.find((e) => e.clerkUserId === log.authorId);
			const resident = residents.find((r) => r._id === log.residentId);

			return {
				id: log._id,
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
	},
});

// Query: Check if selfie is enforced
export const isSelfieEnforced = query({
	args: {},
	handler: async (ctx) => {
		const config = await ctx.db.query('config').first();
		return config?.selfieEnforced || false;
	},
});

// Mutation: Generate upload URL for selfie
export const generateSelfieUploadUrl = mutation({
	args: {},
	handler: async (ctx) => {
		return await ctx.storage.generateUploadUrl();
	},
});

// Query: Get current shift for user
export const getCurrentShift = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		const currentShift = await ctx.db
			.query('shifts')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.filter((q) => q.eq(q.field('clockOutTime'), undefined))
			.order('desc')
			.first();

		return currentShift
			? {
					id: currentShift._id,
					location: currentShift.location,
					clockInTime: currentShift.clockInTime,
					duration: Date.now() - currentShift.clockInTime,
				}
			: null;
	},
});

// Mutation: Clock in
export const clockIn = mutation({
	args: {
		location: v.string(),
		selfieStorageId: v.optional(v.id('_storage')),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const userRole = await requireCareAccess(ctx, clerkUserId);

		// Check if user has access to the specified location
		const userLocations =
			userRole.role === 'admin' ? [] : userRole.locations || [];
		if (userRole.role !== 'admin' && !userLocations.includes(args.location)) {
			throw new Error('Access denied to clock in at this location');
		}

		// Check if selfie is enforced
		const config = await ctx.db.query('config').first();
		if (config?.selfieEnforced && !args.selfieStorageId) {
			throw new Error('Selfie verification is required for clock in');
		}

		const existingShift = await ctx.db
			.query('shifts')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.filter((q) => q.eq(q.field('clockOutTime'), undefined))
			.first();

		if (existingShift) {
			throw new Error('Already clocked in. Please clock out first.');
		}

		const shiftId = await ctx.db.insert('shifts', {
			clerkUserId,
			location: args.location,
			clockInTime: Date.now(),
			deviceId: 'web-browser',
			clockInSelfie: args.selfieStorageId,
		});

		await audit(
			ctx,
			'clock_in',
			clerkUserId,
			`location=${args.location},selfie=${args.selfieStorageId ? 'yes' : 'no'}`
		);
		return shiftId;
	},
});

// Mutation: Clock out
export const clockOut = mutation({
	args: {
		selfieStorageId: v.optional(v.id('_storage')),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		// Note: Selfie is NOT required for clock out, only for clock in

		const currentShift = await ctx.db
			.query('shifts')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.filter((q) => q.eq(q.field('clockOutTime'), undefined))
			.order('desc')
			.first();

		if (!currentShift) {
			throw new Error('No active shift found');
		}

		await ctx.db.patch(currentShift._id, {
			clockOutTime: Date.now(),
			clockOutSelfie: args.selfieStorageId,
		});

		const duration = Date.now() - currentShift.clockInTime;
		await audit(
			ctx,
			'clock_out',
			clerkUserId,
			`location=${currentShift.location},selfie=${args.selfieStorageId ? 'yes' : 'no'}`
		);

		return {
			shiftId: currentShift._id,
			duration,
			location: currentShift.location,
		};
	},
});

export const getResidentIspStatus = query({
	args: {residentId: v.id('residents')},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		const clerkUserId = identity.subject;
		const userRole = await requireCareAccess(ctx, clerkUserId);
		const resident = await ctx.db.get(args.residentId);
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

		const isp = await ctx.db
			.query('isp')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.filter((q) => q.eq(q.field('published'), true))
			.order('desc')
			.first();

		if (!isp) return null;
		const ack = await ctx.db
			.query('isp_acknowledgments')
			.withIndex('by_resident_and_user', (q) =>
				q.eq('residentId', args.residentId).eq('clerkUserId', clerkUserId)
			)
			.filter((q) => q.eq(q.field('ispId'), isp._id))
			.first();
		return {
			id: isp._id,
			version: isp.version || 1,
			dueAt: isp.dueAt,
			acknowledged: !!ack,
		};
	},
});

// Query: Get pending ISP acknowledgments for user
export const getPendingAcknowledgments = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		const isps = await ctx.db
			.query('isp')
			.filter((q) => q.eq(q.field('published'), true))
			.collect();
		const existingAcks = await ctx.db
			.query('isp_acknowledgments')
			.collect()
			.then((acks) => acks.filter((ack) => ack.clerkUserId === clerkUserId));

		const pending = isps.filter((isp) => {
			return !existingAcks.some(
				(ack) => ack.residentId === isp.residentId && ack.ispId === isp._id
			);
		});

		const enriched = await Promise.all(
			pending.map(async (isp) => {
				const resident = await ctx.db.get(isp.residentId);
				return {
					ispId: isp._id,
					residentId: isp.residentId,
					ispVersion: isp.version || 1,
					location: resident?.location || 'Unknown',
					dueAt: isp.dueAt || Date.now(),
				};
			})
		);
		return enriched;
	},
});

// Mutation: Acknowledge ISP
export const acknowledgeIsp = mutation({
	args: {residentId: v.id('residents'), ispId: v.id('isp')},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireCareAccess(ctx, clerkUserId);

		const isp = await ctx.db.get(args.ispId);
		if (!isp || !isp.published) {
			throw new Error('ISP not found or not published');
		}

		await ctx.db.insert('isp_acknowledgments', {
			residentId: args.residentId,
			clerkUserId,
			ispId: args.ispId,
			acknowledgedAt: Date.now(),
			acknowledgedIsp: args.ispId,
		});

		await audit(
			ctx,
			'acknowledge_isp',
			clerkUserId,
			`residentId=${args.residentId}`
		);
		return true;
	},
});
