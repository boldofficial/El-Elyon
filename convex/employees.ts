import {
	mutation,
	query,
	action,
	internalQuery,
	internalMutation,
} from './_generated/server';
import {v} from 'convex/values';
import {internal} from './_generated/api';
import {Id} from './_generated/dataModel';

// Helper to generate a random token
function generateToken(length = 8) {
	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	let token = '';
	for (let i = 0; i < length; i++) {
		token += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return token;
}

// Helper to generate a random password
function generatePassword(length = 12) {
	const chars =
		'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+';
	let password = '';
	for (let i = 0; i < length; i++) {
		password += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return password;
}

// Helper: Get user role doc
async function getUserRoleDoc(ctx: {db: any}, clerkUserId: string) {
	return await ctx.db
		.query('roles')
		.withIndex('by_clerkUserId', (q: any) => q.eq('clerkUserId', clerkUserId))
		.unique();
}

// Helper: Audit (for mutations only)
async function audit(
	ctx: {db: any},
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

// Helper: Check admin access (for queries - no audit)
async function requireAdminQuery(ctx: {db: any}, clerkUserId: string) {
	const userRole = await getUserRoleDoc(ctx, clerkUserId);
	if (!userRole || userRole.role !== 'admin') {
		throw new Error('Admin access required');
	}
	return userRole;
}

// Helper: Check admin access (for mutations - with audit)
async function requireAdmin(ctx: {db: any}, clerkUserId: string) {
	const userRole = await getUserRoleDoc(ctx, clerkUserId);
	if (!userRole || userRole.role !== 'admin') {
		await audit(ctx, 'access_denied', clerkUserId, 'admin_required');
		throw new Error('Admin access required');
	}
	return userRole;
}

// ============================================================================
// ADMIN EXISTENCE CHECK (For SignUp Visibility)
// ============================================================================

/**
 * Check if any admin user exists in the system
 * PUBLIC QUERY - No auth required (for login page)
 */
export const hasAdminUser = query({
	args: {},
	handler: async (ctx) => {
		const adminRole = await ctx.db
			.query('roles')
			.filter((q) => q.eq(q.field('role'), 'admin'))
			.first();

		console.log('🔍 hasAdminUser:', adminRole !== null);
		return adminRole !== null;
	},
});

// ============================================================================
// EMPLOYEE QUERIES
// ============================================================================

// Query: List all employees with mapped fields for frontend (admin only)
export const listEmployees = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdminQuery(ctx, clerkUserId);

		const employees = await ctx.db.query('employees').collect();
		return employees.map((emp) => ({
			id: emp._id,
			name: emp.name,
			email: emp.email,
			workEmail: emp.workEmail,
			phone: emp.phone,
			role: emp.role,
			locations: emp.locations || [],
			clerkUserId: emp.clerkUserId,
			assignedDeviceId: emp.assignedDeviceId,
			onboardedBy: emp.onboardedBy,
			onboardedAt: emp.onboardedAt,
			inviteToken: emp.inviteToken,
			inviteExpiresAt: emp.inviteExpiresAt,
			hasAcceptedInvite: emp.hasAcceptedInvite,
			invitedAt: emp.invitedAt,
			inviteBounced: emp.inviteBounced,
			inviteResent: emp.inviteResent,
			employmentStatus: emp.employmentStatus,
			createdAt: emp.createdAt,
		}));
	},
});

// Query: Get available locations (accessible to care staff)
export const getAvailableLocations = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		// Allow access to care staff and admins
		const userRole = await getUserRoleDoc(ctx, clerkUserId);
		if (
			!userRole ||
			!['admin', 'supervisor', 'staff'].includes(userRole.role)
		) {
			throw new Error('Care access required');
		}

		// Get active locations from the locations table
		const locations = await ctx.db.query('locations').collect();
		const activeLocations = locations
			.filter((loc) => loc.status === 'active')
			.map((loc) => loc.name)
			.sort();

		return activeLocations;
	},
});

// Query: Check if authenticated user needs to be linked to employee
export const checkUserEmployeeLink = query({
	args: {},
	handler: async (ctx) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) return null;
		const clerkUserId = identity.subject;

		// Check if user already has a role
		const existingRole = await getUserRoleDoc(ctx, clerkUserId);
		if (existingRole) return null; // User already has role

		// Look for employee record with matching clerkUserId that has accepted invite
		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.first();

		if (!employee || !employee.hasAcceptedInvite) return null;

		return {
			employeeId: employee._id,
			name: employee.name,
			role: employee.role,
			locations: employee.locations || [],
		};
	},
});

// Query: Check device authorization
export const checkDeviceAuthorization = query({
	args: {
		clerkUserId: v.string(),
		deviceId: v.string(),
	},
	handler: async (ctx, args) => {
		const employee = await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.unique();

		if (!employee) {
			console.log('❌ Employee not found');
			return {isAuthorized: false, reason: 'Employee not found'};
		}

		// IF NO DEVICE ASSIGNED (undefined), ALLOW ACCESS (for admins/flexible users)
		if (!employee.assignedDeviceId) {
			console.log('✅ No device restriction - access granted');
			return {isAuthorized: true};
		}

		// IF DEVICE IS ASSIGNED, CHECK IF IT MATCHES
		if (employee.assignedDeviceId === args.deviceId) {
			console.log('✅ Device matches - access granted');
			return {isAuthorized: true};
		} else {
			console.log('❌ Device mismatch - access denied');
			return {
				isAuthorized: false,
				reason: 'Device not assigned to this employee',
			};
		}
	},
});

// ===============================================================
// INVITE SYSTEM - QUERIES
// ==============================================================

// Query: Get invite link for an employee (admin only)
export const getInviteLink = query({
	args: {employeeId: v.id('employees')},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		await requireAdminQuery(ctx, clerkUserId);

		const employee = await ctx.db.get(args.employeeId);
		if (!employee || !employee.inviteToken || !employee.inviteExpiresAt)
			return null;
		if (employee.hasAcceptedInvite) return null;
		if (employee.inviteExpiresAt < Date.now()) return null;

		// Build invite URL - use window.location.origin in production
		const baseUrl = process.env.SITE_URL || 'http://localhost:5173';
		const inviteUrl = `${baseUrl}/?invite=${employee.inviteToken}`;
		return {
			url: inviteUrl,
			expiresAt: employee.inviteExpiresAt,
			token: employee.inviteToken,
		};
	},
});

// Query: Get invite details by token (public for invite acceptance)
export const getInviteDetails = query({
	args: {token: v.string()},
	handler: async (ctx, args) => {
		console.log('Getting invite details for token:', args.token);

		const employee = await ctx.db
			.query('employees')
			.withIndex('by_inviteToken', (q) => q.eq('inviteToken', args.token))
			.unique();

		console.log('Found employee for token:', employee ? employee.name : 'none');

		if (!employee) {
			console.log('No employee found with token:', args.token);
			return null;
		}

		const expired =
			!employee.inviteExpiresAt || employee.inviteExpiresAt < Date.now();
		console.log(
			'Invite expired:',
			expired,
			'expiresAt:',
			employee.inviteExpiresAt
		);

		return {
			id: employee._id,
			name: employee.name,
			email: employee.email,
			expired,
			hasAcceptedInvite: !!employee.hasAcceptedInvite,
			expiresAt: employee.inviteExpiresAt,
		};
	},
});

// ==================================================================
// INVITE SYSTEM - MUTATIONS
// ==================================================================

// NOTE HERE TO ADD
// Mutation: Generate invite link for an employee (admin only)
// export const generateInviteLink = mutation({
// 	args: {employeeId: v.id('employees')},
// 	handler: async (ctx, args) => {
// 		const identity = await ctx.auth.getUserIdentity();
// 		if (!identity) throw new Error('Not authenticated');
// 		const clerkUserId = identity.subject;

// 		await requireAdminQuery(ctx, clerkUserId);

// 		const employee = await ctx.db.get(args.employeeId);
// 		if (!employee) throw new Error('Employee not found');

// 		// Generate a new token and expiry (24h from now)
// 		const token = generateToken();
// 		const expiresAt = Date.now() + 24 * 60 * 60 * 1000;

// 		await ctx.db.patch(args.employeeId, {
// 			inviteToken: token,
// 			inviteExpiresAt: expiresAt,
// 			inviteResent: Date.now(),
// 			hasAcceptedInvite: false,
// 			inviteBounced: false,
// 		});

// 		await audit(
// 			ctx,
// 			'generate_invite_link',
// 			clerkUserId,
// 			`employeeId=${args.employeeId}`
// 		);

// 		// Send invite email via Resend
// 		try {
// 			await ctx.scheduler.runAfter(0, internal.emails.sendInviteEmail, {
// 				employeeId: args.employeeId,
// 				inviteToken: token,
// 			});
// 			console.log(
// 				'Scheduled invite email for employee:',
// 				args.employeeId,
// 				'with token:',
// 				token
// 			);
// 		} catch (error) {
// 			console.error('Failed to schedule invite email:', error);
// 			// Don't throw here, still return the token so admin can manually share
// 		}

// 		return {token, expiresAt};
// 	},
// });

// Mutation: Accept invite by token (public for invite acceptance)
export const acceptInvite = mutation({
	args: {token: v.string()},
	handler: async (ctx, args) => {
		console.log('Accepting invite for token:', args.token);

		const employee = await ctx.db
			.query('employees')
			.withIndex('by_inviteToken', (q) => q.eq('inviteToken', args.token))
			.unique();

		if (!employee) {
			console.log('No employee found for token:', args.token);
			throw new Error('Invalid invite token');
		}

		if (!employee.inviteExpiresAt || employee.inviteExpiresAt < Date.now()) {
			console.log('Invite expired for employee:', employee.name);
			throw new Error('Invite expired');
		}

		if (employee.hasAcceptedInvite) {
			console.log('Invite already accepted for employee:', employee.name);
			throw new Error('Invite already accepted');
		}

		await ctx.db.patch(employee._id, {
			hasAcceptedInvite: true,
			employmentStatus: 'active',
		});

		await audit(
			ctx,
			'accept_invite',
			null,
			`employeeId=${employee._id},token=${args.token}`
		);

		console.log('Successfully accepted invite for employee:', employee.name);

		return {
			success: true,
			employeeId: employee._id,
			email: employee.email,
			role: employee.role,
			locations: employee.locations || [],
		};
	},
});

// Mutation: Link authenticated Clerk user to employee record and create role
export const linkUserToEmployee = mutation({
	args: {employeeId: v.id('employees')},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;

		const employee = await ctx.db.get(args.employeeId);
		if (!employee) throw new Error('Employee not found');
		if (!employee.hasAcceptedInvite)
			throw new Error('Employee invite not accepted');

		// Check if Clerk user email matches employee email
		const userEmail = identity.email;
		if (userEmail !== employee.email && userEmail !== employee.workEmail) {
			throw new Error('User email does not match employee email');
		}

		// Check if user already has a role
		const existingRole = await ctx.db
			.query('roles')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', clerkUserId))
			.unique();

		if (existingRole) {
			throw new Error('User already has a role assigned');
		}

		// Create role based on employee record
		const roleToAssign = employee.role || 'staff';
		const locationsToAssign = employee.locations || [];

		await ctx.db.insert('roles', {
			clerkUserId,
			role: roleToAssign,
			locations: locationsToAssign,
			assignedAt: Date.now(),
		});

		// Update employee record with Clerk user link
		await ctx.db.patch(args.employeeId, {
			clerkUserId,
			onboardedBy: clerkUserId,
			onboardedAt: Date.now(),
		});

		await audit(
			ctx,
			'link_user_to_employee',
			clerkUserId,
			`employeeId=${args.employeeId},role=${roleToAssign}`
		);

		return {success: true, role: roleToAssign, locations: locationsToAssign};
	},
});

// ============================================================================
// EMPLOYEE CRUD - CREATE (Admin creates account directly)
// ============================================================================

/**
 * Create employee with Clerk account (admin only)
 * ✅ WEBHOOK-ONLY APPROACH: Webhook handles ALL record creation
 * ✅ This action creates Clerk user and waits for webhook to complete
 * ✅ No fallback - relies entirely on webhook
 */
export const createEmployee = action({
	args: {
		name: v.string(),
		email: v.string(),
		role: v.union(
			v.literal('admin'),
			v.literal('supervisor'),
			v.literal('staff')
		),
		locations: v.array(v.string()),
		assignedDeviceId: v.optional(v.string()),
	},
	handler: async (
		ctx,
		args
	): Promise<{
		success: boolean;
		clerkUserId: string;
		generatedPassword: string;
	}> => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const adminClerkUserId = identity.subject;

		// Check if employee with this email already exists
		const existingEmployee = await ctx.runQuery(
			internal.employees.getEmployeeByEmail,
			{email: args.email}
		);

		if (existingEmployee) {
			throw new Error('Employee with this email already exists');
		}

		// Generate a secure random password
		const generatedPassword = generatePassword(16);

		console.log('🔐 Creating Clerk user for:', args.email);

		// ✅ STEP 1: Create Clerk user with metadata
		// Webhook will automatically create employee/role records
		let clerkUser;
		try {
			clerkUser = await ctx.runAction(internal.clerkActions.createClerkUser, {
				email: args.email,
				password: generatedPassword,
				firstName: args.name.split(' ')[0] || '',
				lastName: args.name.split(' ').slice(1).join(' ') || '',
				role: args.role,
				locations: args.locations,
				assignedDeviceId: args.assignedDeviceId,
			});
		} catch (error) {
			console.error('❌ Failed to create Clerk user:', error);
			throw new Error(
				`Failed to create employee account: ${error instanceof Error ? error.message : String(error)}`
			);
		}

		if (!clerkUser || !clerkUser.clerkUserId) {
			throw new Error('Failed to get Clerk user ID after creation');
		}
		const clerkUserId = clerkUser.clerkUserId;

		console.log('✅ Clerk user created:', clerkUserId);

		// ✅ STEP 2: Wait for webhook to create employee record
		console.log('⏳ Waiting for webhook to create employee record...');
		let employee = null;
		let attempts = 0;
		const maxAttempts = 20; // 20 seconds max wait time

		while (attempts < maxAttempts) {
			employee = await ctx.runQuery(
				internal.employees.getEmployeeByClerkUserId,
				{clerkUserId}
			);

			if (employee) {
				console.log('✅ Webhook successfully created employee record');
				break;
			}

			// Wait 1 second before next attempt
			await new Promise((resolve) => setTimeout(resolve, 1000));
			attempts++;
			console.log(`⏳ Attempt ${attempts}/${maxAttempts}...`);
		}

		// ✅ STEP 3: Verify webhook created the employee
		if (!employee) {
			console.error(
				'❌ Webhook failed to create employee record within timeout period'
			);
			throw new Error(
				'Webhook did not create employee record. Please check webhook configuration and try again.'
			);
		}

		// ✅ STEP 4: Log audit
		await ctx.runMutation(internal.audit.log, {
			clerkUserId: adminClerkUserId,
			event: 'create_employee',
			details: `employeeId=${employee._id},clerkUserId=${clerkUserId},role=${args.role},assignedDeviceId=${args.assignedDeviceId || 'none'}`,
			deviceId: 'system',
			location: '',
		});

		// ✅ STEP 5: Send welcome email with credentials
		try {
			await ctx.scheduler.runAfter(
				0,
				internal.emails.sendWelcomeEmailWithCredentials,
				{
					employeeId: employee._id,
					email: args.email,
					password: generatedPassword,
				}
			);
			console.log(
				'📧 Scheduled welcome email with credentials for:',
				args.email
			);
		} catch (error) {
			console.error('❌ Failed to schedule welcome email:', error);
			// Don't throw - account was created successfully
		}

		return {
			success: true,
			clerkUserId: clerkUserId,
			generatedPassword,
		};
	},
});

// ============================================================================
// EMPLOYEE CRUD - UPDATE
// ============================================================================

/**
 * Update employee (admin only)
 * ✅ Updates both Convex and Clerk metadata
 */
export const updateEmployee = mutation({
	args: {
		employeeId: v.id('employees'),
		name: v.string(),
		email: v.string(),
		role: v.union(
			v.literal('admin'),
			v.literal('supervisor'),
			v.literal('staff')
		),
		locations: v.array(v.string()),
		assignedDeviceId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;
		await requireAdmin(ctx, clerkUserId);

		const employee = await ctx.db.get(args.employeeId);
		if (!employee) throw new Error('Employee not found');

		// Update employee record
		await ctx.db.patch(args.employeeId, {
			name: args.name,
			email: args.email,
			workEmail: args.email,
			role: args.role,
			locations: args.locations,
			updatedAt: Date.now(),
			assignedDeviceId: args.assignedDeviceId,
		});

		// Update role if employee has clerkUserId
		if (employee.clerkUserId) {
			const role = await ctx.db
				.query('roles')
				.withIndex('by_clerkUserId', (q) =>
					q.eq('clerkUserId', employee.clerkUserId!)
				)
				.unique();

			if (role) {
				await ctx.db.patch(role._id, {
					role: args.role,
					locations: args.locations,
				});
			}

			// Update Clerk metadata to keep in sync
			try {
				await ctx.scheduler.runAfter(
					0,
					internal.clerkActions.updateClerkMetadata,
					{
						clerkUserId: employee.clerkUserId,
						role: args.role,
						locations: args.locations,
						assignedDeviceId: args.assignedDeviceId,
					}
				);
				console.log('✅ Scheduled Clerk metadata update');
			} catch (error) {
				console.error('❌ Failed to schedule Clerk metadata update:', error);
				// Don't throw - local update succeeded
			}
		}

		await audit(
			ctx,
			'update_employee',
			clerkUserId,
			`employeeId=${args.employeeId},role=${args.role},assignedDeviceId=${args.assignedDeviceId || 'none'}`
		);
		return {success: true};
	},
});

// ============================================================================
// EMPLOYEE CRUD - DELETE
// ============================================================================

/**
 * Delete employee with cascade (admin only)
 */
export const deleteEmployee = mutation({
	args: {employeeId: v.id('employees')},
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');
		const clerkUserId = identity.subject;
		await requireAdmin(ctx, clerkUserId);

		const employee = await ctx.db.get(args.employeeId);
		if (!employee) throw new Error('Employee not found');

		let linkedClerkUserId: string | null = null;
		if (employee.clerkUserId) {
			linkedClerkUserId = employee.clerkUserId;
		}

		if (linkedClerkUserId) {
			// Delete all related records
			const role = await ctx.db
				.query('roles')
				.withIndex('by_clerkUserId', (q) =>
					q.eq('clerkUserId', linkedClerkUserId)
				)
				.unique();
			if (role) await ctx.db.delete(role._id);

			const shifts = await ctx.db
				.query('shifts')
				.withIndex('by_clerkUserId', (q) =>
					q.eq('clerkUserId', linkedClerkUserId)
				)
				.collect();
			for (const shift of shifts) await ctx.db.delete(shift._id);

			const logs = await ctx.db
				.query('resident_logs')
				.withIndex('by_authorId', (q) => q.eq('authorId', linkedClerkUserId))
				.collect();
			for (const log of logs) await ctx.db.delete(log._id);

			const audits = await ctx.db
				.query('audit_logs')
				.withIndex('by_clerkUserId', (q) =>
					q.eq('clerkUserId', linkedClerkUserId)
				)
				.collect();
			for (const auditLog of audits) await ctx.db.delete(auditLog._id);

			const ispAccessLogs = await ctx.db
				.query('isp_access_logs')
				.withIndex('by_clerkUserId', (q) =>
					q.eq('clerkUserId', linkedClerkUserId)
				)
				.collect();
			for (const log of ispAccessLogs) await ctx.db.delete(log._id);

			const ispAcks = await ctx.db.query('isp_acknowledgments').collect();
			for (const ack of ispAcks) {
				if (ack.clerkUserId === linkedClerkUserId) {
					await ctx.db.delete(ack._id);
				}
			}

			const alerts = await ctx.db.query('compliance_alerts').collect();
			for (const alert of alerts) {
				if (alert.dismissedBy === linkedClerkUserId) {
					await ctx.db.patch(alert._id, {dismissedBy: undefined});
				}
			}

			const residents = await ctx.db
				.query('residents')
				.withIndex('by_createdBy', (q) => q.eq('createdBy', linkedClerkUserId))
				.collect();
			for (const resident of residents) {
				await ctx.db.patch(resident._id, {createdBy: undefined});
			}

			const guardians = await ctx.db
				.query('guardians')
				.withIndex('by_createdBy', (q) => q.eq('createdBy', linkedClerkUserId))
				.collect();
			for (const guardian of guardians) {
				await ctx.db.patch(guardian._id, {createdBy: undefined});
			}

			const kiosks = await ctx.db.query('kiosks').collect();
			for (const kiosk of kiosks) {
				if (
					kiosk.createdBy === linkedClerkUserId ||
					kiosk.registeredBy === linkedClerkUserId
				) {
					await ctx.db.patch(kiosk._id, {
						createdBy: undefined,
						registeredBy: undefined,
					});
				}
			}

			const user = await ctx.db
				.query('users')
				.withIndex('by_clerkUserId', (q) =>
					q.eq('clerkUserId', linkedClerkUserId)
				)
				.first();
			if (user) await ctx.db.delete(user._id);

			// Schedule deletion of Clerk user account
			try {
				await ctx.scheduler.runAfter(0, internal.clerkActions.deleteClerkUser, {
					clerkUserId: linkedClerkUserId,
				});
				console.log('✅ Scheduled deletion of Clerk user:', linkedClerkUserId);
			} catch (error) {
				console.error('❌ Failed to schedule Clerk user deletion:', error);
			}
		}

		// Delete the employee record
		await ctx.db.delete(args.employeeId);

		await audit(
			ctx,
			'delete_employee',
			clerkUserId,
			`employeeId=${args.employeeId},linkedClerkUserId=${linkedClerkUserId || 'none'}`
		);
		return {success: true};
	},
});

// ============================================================================
// INTERNAL QUERIES FOR EMAIL SYSTEM
// ============================================================================

// Internal query to get employee for email
export const getEmployeeForEmail = internalQuery({
	args: {employeeId: v.id('employees')},
	handler: async (ctx, args) => {
		const employee = await ctx.db.get(args.employeeId);
		if (!employee) return null;

		return {
			name: employee.name,
			email: employee.email || employee.workEmail || '',
			role: employee.role || 'staff',
			locations: employee.locations || [],
		};
	},
});

// Internal query to get employee by email (for createEmployee action)
export const getEmployeeByEmail = internalQuery({
	args: {email: v.string()},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('employees')
			.filter((q) =>
				q.or(
					q.eq(q.field('email'), args.email),
					q.eq(q.field('workEmail'), args.email)
				)
			)
			.first();
	},
});

// Internal query to get employee by Clerk user ID
export const getEmployeeByClerkUserId = internalQuery({
	args: {clerkUserId: v.string()},
	handler: async (ctx, args) => {
		return await ctx.db
			.query('employees')
			.withIndex('by_clerkUserId', (q) => q.eq('clerkUserId', args.clerkUserId))
			.first();
	},
});

// Internal query to check if any admins exist
export const checkForAdmins = internalQuery({
	args: {},
	handler: async (ctx) => {
		return await ctx.db
			.query('roles')
			.filter((q) => q.eq(q.field('role'), 'admin'))
			.collect();
	},
});
