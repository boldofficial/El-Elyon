import {mutation, query} from './_generated/server';
import {v} from 'convex/values';
// import { getAuthUserId } from "@convex-dev/auth/server"; // Removed as per plan
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
		clerkUserId: clerkUserId,
		event,
		timestamp: Date.now(),
		deviceId: 'system',
		location: '',
		details,
	});
}

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

// Save resident fire evac plan
export const saveResidentFireEvacPlan = mutation({
	args: {
		residentId: v.id('residents'),
		fileStorageId: v.id('_storage'),
		fileName: v.string(),
		fileSize: v.number(),
		contentType: v.string(),
		mobilityNeeds: v.optional(v.string()),
		assistanceRequired: v.optional(v.string()),
		medicalEquipment: v.optional(v.string()),
		specialInstructions: v.optional(v.string()),
		notes: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const userRole = await getUserRoleDoc(ctx, clerkUserId);
		if (!userRole || !['admin', 'supervisor'].includes(userRole.role)) {
			throw new Error(
				'Only admins and supervisors can upload fire evacuation plans'
			);
		}

		const resident = await ctx.db.get(args.residentId);
		if (!resident) throw new Error('Resident not found');

		// Get latest version for this resident
		const existingPlans = await ctx.db
			.query('fire_evac')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.collect();

		const latestVersion =
			existingPlans.length > 0
				? Math.max(...existingPlans.map((p) => p.version))
				: 0;

		const newVersion = latestVersion + 1;

		await ctx.db.insert('fire_evac', {
			residentId: args.residentId,
			location: resident.location,
			version: newVersion,
			fileStorageId: args.fileStorageId,
			fileName: args.fileName,
			fileSize: args.fileSize,
			contentType: args.contentType,
			mobilityNeeds: args.mobilityNeeds,
			assistanceRequired: args.assistanceRequired,
			medicalEquipment: args.medicalEquipment,
			specialInstructions: args.specialInstructions,
			notes: args.notes,
			createdAt: Date.now(),
			createdBy: clerkUserId,
		});

		await audit(
			ctx,
			'upload_fire_evac_plan',
			clerkUserId,
			`residentId=${args.residentId},version=${newVersion}`
		);
		return {success: true, version: newVersion};
	},
});

// Get fire evac plans for a resident
export const getResidentFireEvacPlans = query({
	args: {residentId: v.id('residents')},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const userRole = await getUserRoleDoc(ctx, clerkUserId);
		if (
			!userRole ||
			!['admin', 'supervisor', 'staff'].includes(userRole.role)
		) {
			throw new Error('Care access required');
		}

		const plans = await ctx.db
			.query('fire_evac')
			.withIndex('by_residentId', (q) => q.eq('residentId', args.residentId))
			.order('desc')
			.collect();

		const plansWithUrls = await Promise.all(
			plans.map(async (plan) => {
				const url = plan.fileStorageId
					? await ctx.storage.getUrl(plan.fileStorageId)
					: null;

				// Calculate due date (1 year from creation)
				const dueDate =
					(plan.createdAt || Date.now()) + 365 * 24 * 60 * 60 * 1000;
				const now = Date.now();
				const daysUntilDue = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

				let status = 'ok';
				if (daysUntilDue < 0) status = 'overdue';
				else if (daysUntilDue <= 30) status = 'due-soon';

				return {
					_id: plan._id,
					residentId: plan.residentId,
					version: plan.version,
					fileName: plan.fileName,
					fileSize: plan.fileSize,
					contentType: plan.contentType,
					mobilityNeeds: plan.mobilityNeeds,
					assistanceRequired: plan.assistanceRequired,
					medicalEquipment: plan.medicalEquipment,
					specialInstructions: plan.specialInstructions,
					notes: plan.notes,
					createdAt: plan.createdAt,
					createdBy: plan.createdBy,
					url,
					dueDate,
					status,
					daysUntilDue,
				};
			})
		);

		return plansWithUrls;
	},
});
