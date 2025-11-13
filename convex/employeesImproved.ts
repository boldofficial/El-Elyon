// import {mutation, query, action, internalQuery} from './_generated/server';
// import {v} from 'convex/values';
// import {getAuthUserId} from '@convex-dev/auth/server';
// import {api} from './_generated/api';
// import {internal} from './_generated/api';
// import {Id} from './_generated/dataModel';

// // Helper to generate a random token
// function generateToken(length = 8) {
// 	const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
// 	let token = '';
// 	for (let i = 0; i < length; i++) {
// 		token += chars.charAt(Math.floor(Math.random() * chars.length));
// 	}
// 	return token;
// }

// // Helper: Get user role doc
// async function getUserRoleDoc(ctx: {db: any}, userId: Id<'users'>) {
// 	return await ctx.db
// 		.query('roles')
// 		.withIndex('by_userId', (q: any) => q.eq('userId', userId))
// 		.unique();
// }

// // Helper: Audit (for mutations only)
// async function audit(
// 	ctx: {db: any},
// 	event: string,
// 	userId: Id<'users'> | null,
// 	details?: string
// ) {
// 	await ctx.db.insert('audit_logs', {
// 		userId: userId ?? undefined,
// 		event,
// 		timestamp: Date.now(),
// 		deviceId: 'system',
// 		location: '',
// 		details,
// 	});
// }

// // Helper: Check admin access (for queries - no audit)
// async function requireAdminQuery(ctx: {db: any}, userId: Id<'users'>) {
// 	const userRole = await getUserRoleDoc(ctx, userId);
// 	if (!userRole || userRole.role !== 'admin') {
// 		throw new Error('Admin access required');
// 	}
// 	return userRole;
// }

// // Helper: Check admin access (for mutations - with audit)
// async function requireAdmin(ctx: {db: any}, userId: Id<'users'>) {
// 	const userRole = await getUserRoleDoc(ctx, userId);
// 	if (!userRole || userRole.role !== 'admin') {
// 		await audit(ctx, 'access_denied', userId, 'admin_required');
// 		throw new Error('Admin access required');
// 	}
// 	return userRole;
// }

// // Query: List all employees with mapped fields for frontend (admin only)
// export const listEmployees = query({
// 	args: {},
// 	handler: async (ctx) => {
// 		const userId = await getAuthUserId(ctx);
// 		if (!userId) throw new Error('Not authenticated');

// 		await requireAdminQuery(ctx, userId);

// 		const employees = await ctx.db.query('employees').collect();
// 		return employees.map((emp) => ({
// 			id: emp._id,
// 			name: emp.name,
// 			email: emp.email,
// 			workEmail: emp.workEmail,
// 			phone: emp.phone,
// 			role: emp.role,
// 			locations: emp.locations || [],
// 			onboardedBy: emp.onboardedBy,
// 			onboardedAt: emp.onboardedAt,
// 			inviteToken: emp.inviteToken,
// 			inviteExpiresAt: emp.inviteExpiresAt,
// 			hasAcceptedInvite: emp.hasAcceptedInvite,
// 			invitedAt: emp.invitedAt,
// 			inviteBounced: emp.inviteBounced,
// 			inviteResent: emp.inviteResent,
// 			employmentStatus: emp.employmentStatus,
// 		}));
// 	},
// });

// // Mutation: Generate invite link for an employee (admin only)
// export const generateInviteLink = mutation({
// 	args: {employeeId: v.id('employees')},
// 	handler: async (ctx, args) => {
// 		const userId = await getAuthUserId(ctx);
// 		if (!userId) throw new Error('Not authenticated');

// 		await requireAdmin(ctx, userId);

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
// 			userId,
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

// // Query: Get invite link for an employee (admin only)
// export const getInviteLink = query({
// 	args: {employeeId: v.id('employees')},
// 	handler: async (ctx, args) => {
// 		const userId = await getAuthUserId(ctx);
// 		if (!userId) throw new Error('Not authenticated');

// 		await requireAdminQuery(ctx, userId);

// 		const employee = await ctx.db.get(args.employeeId);
// 		if (!employee || !employee.inviteToken || !employee.inviteExpiresAt)
// 			return null;
// 		if (employee.hasAcceptedInvite) return null;
// 		if (employee.inviteExpiresAt < Date.now()) return null;

// 		// Build invite URL - use window.location.origin in production
// 		const baseUrl = process.env.SITE_URL || 'http://localhost:5173';
// 		const inviteUrl = `${baseUrl}/?invite=${employee.inviteToken}`;
// 		return {
// 			url: inviteUrl,
// 			expiresAt: employee.inviteExpiresAt,
// 			token: employee.inviteToken,
// 		};
// 	},
// });

// // Query: Get invite details by token (public for invite acceptance)
// export const getInviteDetails = query({
// 	args: {token: v.string()},
// 	handler: async (ctx, args) => {
// 		console.log('Getting invite details for token:', args.token);

// 		const employee = await ctx.db
// 			.query('employees')
// 			.withIndex('by_inviteToken', (q) => q.eq('inviteToken', args.token))
// 			.unique();

// 		console.log('Found employee for token:', employee ? employee.name : 'none');

// 		if (!employee) {
// 			console.log('No employee found with token:', args.token);
// 			return null;
// 		}

// 		const expired =
// 			!employee.inviteExpiresAt || employee.inviteExpiresAt < Date.now();
// 		console.log(
// 			'Invite expired:',
// 			expired,
// 			'expiresAt:',
// 			employee.inviteExpiresAt
// 		);

// 		return {
// 			id: employee._id,
// 			name: employee.name,
// 			email: employee.email,
// 			expired,
// 			hasAcceptedInvite: !!employee.hasAcceptedInvite,
// 			expiresAt: employee.inviteExpiresAt,
// 		};
// 	},
// });

// // Mutation: Accept invite by token (public for invite acceptance)
// export const acceptInvite = mutation({
// 	args: {token: v.string()},
// 	handler: async (ctx, args) => {
// 		console.log('Accepting invite for token:', args.token);

// 		const employee = await ctx.db
// 			.query('employees')
// 			.withIndex('by_inviteToken', (q) => q.eq('inviteToken', args.token))
// 			.unique();

// 		if (!employee) {
// 			console.log('No employee found for token:', args.token);
// 			throw new Error('Invalid invite token');
// 		}

// 		if (!employee.inviteExpiresAt || employee.inviteExpiresAt < Date.now()) {
// 			console.log('Invite expired for employee:', employee.name);
// 			throw new Error('Invite expired');
// 		}

// 		if (employee.hasAcceptedInvite) {
// 			console.log('Invite already accepted for employee:', employee.name);
// 			throw new Error('Invite already accepted');
// 		}

// 		await ctx.db.patch(employee._id, {
// 			hasAcceptedInvite: true,
// 			employmentStatus: 'active',
// 		});

// 		await audit(
// 			ctx,
// 			'accept_invite',
// 			null,
// 			`employeeId=${employee._id},token=${args.token}`
// 		);

// 		console.log('Successfully accepted invite for employee:', employee.name);

// 		return {
// 			success: true,
// 			employeeId: employee._id,
// 			email: employee.email,
// 			role: employee.role,
// 			locations: employee.locations || [],
// 		};
// 	},
// });

// // Mutation: Link authenticated user to employee record and create role
// export const linkUserToEmployee = mutation({
// 	args: {employeeId: v.id('employees')},
// 	handler: async (ctx, args) => {
// 		const userId = await getAuthUserId(ctx);
// 		if (!userId) throw new Error('Not authenticated');

// 		const employee = await ctx.db.get(args.employeeId);
// 		if (!employee) throw new Error('Employee not found');
// 		if (!employee.hasAcceptedInvite)
// 			throw new Error('Employee invite not accepted');

// 		const user = await ctx.db.get(userId);
// 		if (!user) throw new Error('User not found');

// 		// Check if user email matches employee email
// 		if (user.email !== employee.email) {
// 			throw new Error('User email does not match employee email');
// 		}

// 		// Check if user already has a role
// 		const existingRole = await ctx.db
// 			.query('roles')
// 			.withIndex('by_userId', (q: any) => q.eq('userId', userId))
// 			.unique();

// 		if (existingRole) {
// 			throw new Error('User already has a role assigned');
// 		}

// 		// Create role based on employee record
// 		const roleToAssign = employee.role || 'staff'; // Default to staff if no role specified
// 		const locationsToAssign = employee.locations || [];

// 		await ctx.db.insert('roles', {
// 			userId,
// 			role: roleToAssign as 'admin' | 'supervisor' | 'staff',
// 			locations: locationsToAssign,
// 		});

// 		// Update employee record with user link
// 		await ctx.db.patch(args.employeeId, {
// 			onboardedBy: userId,
// 			onboardedAt: Date.now(),
// 		});

// 		await audit(
// 			ctx,
// 			'link_user_to_employee',
// 			userId,
// 			`employeeId=${args.employeeId},role=${roleToAssign}`
// 		);

// 		return {success: true, role: roleToAssign, locations: locationsToAssign};
// 	},
// });

// // Query: Check if authenticated user needs to be linked to employee
// export const checkUserEmployeeLink = query({
// 	args: {},
// 	handler: async (ctx) => {
// 		const userId = await getAuthUserId(ctx);
// 		if (!userId) return null;

// 		const user = await ctx.db.get(userId);
// 		if (!user || !user.email) return null;

// 		// Check if user already has a role
// 		const existingRole = await getUserRoleDoc(ctx, userId);
// 		if (existingRole) return null; // User already has role

// 		// Look for employee record with matching email that has accepted invite
// 		const employee = await ctx.db
// 			.query('employees')
// 			.filter((q) => q.eq(q.field('email'), user.email))
// 			.filter((q) => q.eq(q.field('hasAcceptedInvite'), true))
// 			.first();

// 		if (!employee) return null;

// 		return {
// 			employeeId: employee._id,
// 			name: employee.name,
// 			role: employee.role,
// 			locations: employee.locations || [],
// 		};
// 	},
// });

// // Query: Get available locations (accessible to care staff for resident/guardian management)
// export const getAvailableLocations = query({
// 	args: {},
// 	handler: async (ctx) => {
// 		const userId = await getAuthUserId(ctx);
// 		if (!userId) throw new Error('Not authenticated');

// 		// Allow access to care staff and admins
// 		const userRole = await getUserRoleDoc(ctx, userId);
// 		if (
// 			!userRole ||
// 			!['admin', 'supervisor', 'staff'].includes(userRole.role)
// 		) {
// 			throw new Error('Care access required');
// 		}

// 		// Get active locations from the locations table
// 		const locations = await ctx.db.query('locations').collect();
// 		const activeLocations = locations
// 			.filter((loc) => loc.status === 'active')
// 			.map((loc) => loc.name)
// 			.sort();

// 		return activeLocations;
// 	},
// });

// // --- CREATE EMPLOYEE MUTATION (admin only) ---
// export const createEmployee = mutation({
// 	args: {
// 		name: v.string(),
// 		email: v.string(),
// 		role: v.union(
// 			v.literal('admin'),
// 			v.literal('supervisor'),
// 			v.literal('staff')
// 		),
// 		locations: v.array(v.string()),
// 	},
// 	handler: async (ctx, args) => {
// 		const userId = await getAuthUserId(ctx);
// 		if (!userId) throw new Error('Not authenticated');
// 		await requireAdmin(ctx, userId);

// 		// Check if employee with this email already exists
// 		const existingEmployee = await ctx.db
// 			.query('employees')
// 			.filter((q) => q.eq(q.field('email'), args.email))
// 			.first();

// 		if (existingEmployee) {
// 			throw new Error('Employee with this email already exists');
// 		}

// 		// Generate invite token and expiry
// 		const token = generateToken();
// 		const expiresAt = Date.now() + 24 * 60 * 60 * 1000; // 24 hours

// 		const employeeId = await ctx.db.insert('employees', {
// 			name: args.name,
// 			email: args.email,
// 			workEmail: args.email,
// 			role: args.role,
// 			locations: args.locations,
// 			inviteToken: token,
// 			inviteExpiresAt: expiresAt,
// 			invitedAt: Date.now(),
// 			hasAcceptedInvite: false,
// 			employmentStatus: 'pending',
// 			inviteBounced: false,
// 			inviteResent: 0,
// 		});

// 		await audit(
// 			ctx,
// 			'create_employee',
// 			userId,
// 			`employeeId=${employeeId},role=${args.role}`
// 		);

// 		// Send invite email via Resend
// 		try {
// 			await ctx.scheduler.runAfter(0, internal.emails.sendInviteEmail, {
// 				employeeId: employeeId,
// 				inviteToken: token,
// 			});
// 			console.log(
// 				'Scheduled invite email for new employee:',
// 				employeeId,
// 				'with token:',
// 				token
// 			);
// 		} catch (error) {
// 			console.error('Failed to schedule invite email for new employee:', error);
// 			// Don't throw here, still return success so admin can manually share invite
// 		}

// 		return {
// 			success: true,
// 			employeeId,
// 			inviteToken: token,
// 			inviteExpiresAt: expiresAt,
// 		};
// 	},
// });

// // --- UPDATE EMPLOYEE MUTATION (admin only) ---
// export const updateEmployee = mutation({
// 	args: {
// 		employeeId: v.id('employees'),
// 		name: v.string(),
// 		email: v.string(),
// 		role: v.union(
// 			v.literal('admin'),
// 			v.literal('supervisor'),
// 			v.literal('staff')
// 		),
// 		locations: v.array(v.string()),
// 	},
// 	handler: async (ctx, args) => {
// 		const userId = await getAuthUserId(ctx);
// 		if (!userId) throw new Error('Not authenticated');
// 		await requireAdmin(ctx, userId);

// 		const employee = await ctx.db.get(args.employeeId);
// 		if (!employee) throw new Error('Employee not found');

// 		// Update employee record
// 		await ctx.db.patch(args.employeeId, {
// 			name: args.name,
// 			email: args.email,
// 			role: args.role,
// 			locations: args.locations,
// 			updatedAt: Date.now(),
// 		});

// 		await audit(
// 			ctx,
// 			'update_employee',
// 			userId,
// 			`employeeId=${args.employeeId},role=${args.role}`
// 		);
// 		return {success: true};
// 	},
// });

// // --- DELETE EMPLOYEE MUTATION (admin only) - CASCADE ---
// export const deleteEmployee = mutation({
// 	args: {employeeId: v.id('employees')},
// 	handler: async (ctx, args) => {
// 		const userId = await getAuthUserId(ctx);
// 		if (!userId) throw new Error('Not authenticated');
// 		await requireAdmin(ctx, userId);

// 		const employee = await ctx.db.get(args.employeeId);
// 		if (!employee) throw new Error('Employee not found');

// 		// CASCADE: Find and delete linked user account and all related data
// 		let linkedUserId: Id<'users'> | null = null;
// 		if (employee.email) {
// 			const users = await ctx.db.query('users').collect();
// 			const linkedUser = users.find((u) => u.email === employee.email);
// 			if (linkedUser) {
// 				linkedUserId = linkedUser._id;
// 			}
// 		}

// 		if (linkedUserId) {
// 			// 1. Delete role record
// 			const role = await ctx.db
// 				.query('roles')
// 				.withIndex('by_userId', (q: any) => q.eq('userId', linkedUserId))
// 				.unique();
// 			if (role) {
// 				await ctx.db.delete(role._id);
// 			}

// 			// 2. Delete all shifts
// 			const shifts = await ctx.db
// 				.query('shifts')
// 				.withIndex('by_userId', (q) => q.eq('userId', linkedUserId))
// 				.collect();
// 			for (const shift of shifts) {
// 				await ctx.db.delete(shift._id);
// 			}

// 			// 3. Delete all resident_logs
// 			const logs = await ctx.db
// 				.query('resident_logs')
// 				.withIndex('by_authorId', (q) => q.eq('authorId', linkedUserId))
// 				.collect();
// 			for (const log of logs) {
// 				await ctx.db.delete(log._id);
// 			}

// 			// 4. Delete all audit_logs
// 			const audits = await ctx.db
// 				.query('audit_logs')
// 				.withIndex('by_userId', (q) => q.eq('userId', linkedUserId))
// 				.collect();
// 			for (const auditLog of audits) {
// 				await ctx.db.delete(auditLog._id);
// 			}

// 			// 5. Delete all ISP access logs
// 			const ispAccessLogs = await ctx.db
// 				.query('isp_access_logs')
// 				.withIndex('by_userId', (q) => q.eq('userId', linkedUserId))
// 				.collect();
// 			for (const log of ispAccessLogs) {
// 				await ctx.db.delete(log._id);
// 			}

// 			// 6. Delete all ISP acknowledgments
// 			const ispAcks = await ctx.db.query('isp_acknowledgments').collect();
// 			for (const ack of ispAcks) {
// 				if (ack.userId === linkedUserId) {
// 					await ctx.db.delete(ack._id);
// 				}
// 			}

// 			// 7. Update compliance_alerts dismissed by this user (set to null)
// 			const alerts = await ctx.db.query('compliance_alerts').collect();
// 			for (const alert of alerts) {
// 				if (alert.dismissedBy === linkedUserId) {
// 					await ctx.db.patch(alert._id, {dismissedBy: undefined});
// 				}
// 			}

// 			// 8. Update residents created by this user (set to null)
// 			const residents = await ctx.db
// 				.query('residents')
// 				.withIndex('by_createdBy', (q) => q.eq('createdBy', linkedUserId))
// 				.collect();
// 			for (const resident of residents) {
// 				await ctx.db.patch(resident._id, {createdBy: undefined});
// 			}

// 			// 9. Update guardians created by this user (set to null)
// 			const guardians = await ctx.db
// 				.query('guardians')
// 				.withIndex('by_createdBy', (q) => q.eq('createdBy', linkedUserId))
// 				.collect();
// 			for (const guardian of guardians) {
// 				await ctx.db.patch(guardian._id, {createdBy: undefined});
// 			}

// 			// 10. Update kiosks created/registered by this user (set to null)
// 			const kiosks = await ctx.db.query('kiosks').collect();
// 			for (const kiosk of kiosks) {
// 				if (
// 					kiosk.createdBy === linkedUserId ||
// 					kiosk.registeredBy === linkedUserId
// 				) {
// 					await ctx.db.patch(kiosk._id, {
// 						createdBy: undefined,
// 						registeredBy: undefined,
// 					});
// 				}
// 			}

// 			// 11. Delete the linked user account
// 			await ctx.db.delete(linkedUserId);
// 		}

// 		// 12. Delete the employee record
// 		await ctx.db.delete(args.employeeId);

// 		await audit(
// 			ctx,
// 			'delete_employee',
// 			userId,
// 			`employeeId=${args.employeeId},linkedUserId=${linkedUserId || 'none'}`
// 		);
// 		return {success: true};
// 	},
// });

// // --- INTERNAL QUERY TO GET EMPLOYEE FOR EMAIL ---
// export const getEmployeeForEmail = internalQuery({
// 	args: {employeeId: v.id('employees')},
// 	handler: async (ctx, args) => {
// 		const employee = await ctx.db.get(args.employeeId);
// 		if (!employee) return null;

// 		return {
// 			name: employee.name,
// 			email: employee.email || employee.workEmail || '',
// 			role: employee.role || 'staff',
// 			locations: employee.locations || [],
// 		};
// 	},
// });

// //

// import {internalAction} from './_generated/server';
// import {v} from 'convex/values';
// import {Id} from './_generated/dataModel';
// import {internal} from './_generated/api';

// // --- SEND INVITE EMAIL ACTION (internal) ---
// export const sendInviteEmail = internalAction({
// 	args: {
// 		employeeId: v.id('employees'),
// 		inviteToken: v.string(),
// 	},
// 	handler: async (ctx, args) => {
// 		console.log(
// 			'Starting email send for employee:',
// 			args.employeeId,
// 			'token:',
// 			args.inviteToken
// 		);

// 		try {
// 			const {Resend} = await import('resend');

// 			// Get employee details
// 			const employee = await ctx.runQuery(
// 				internal.employees.getEmployeeForEmail,
// 				{
// 					employeeId: args.employeeId,
// 				}
// 			);

// 			if (!employee || !employee.email) {
// 				console.error('Employee data missing:', employee);
// 				throw new Error('Employee not found or email missing');
// 			}

// 			console.log('Sending invite email to:', employee.email);

// 			// Use custom Resend API key if available, otherwise fall back to Convex proxy
// 			const apiKey =
// 				process.env.RESEND_API_KEY || process.env.CONVEX_RESEND_API_KEY;
// 			if (!apiKey) {
// 				console.error('No Resend API key available');
// 				throw new Error('No email service configured');
// 			}

// 			const resend = new Resend(apiKey);

// 			// Build invite URL - use environment variable or fallback
// 			const baseUrl =
// 				process.env.SITE_URL ||
// 				process.env.CONVEX_SITE_URL ||
// 				'http://localhost:5173';
// 			const inviteUrl = `${baseUrl}/?invite=${args.inviteToken}`;

// 			console.log('Invite URL:', inviteUrl);

// 			const emailHtml = `
//         <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
//           <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
//             <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to Our Care Team!</h1>
//           </div>
          
//           <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
//             <h2 style="color: #333; margin-top: 0;">Hi ${employee.name},</h2>
            
//             <p style="color: #555; font-size: 16px; line-height: 1.6;">
//               You've been invited to join our care management system as a <strong>${employee.role}</strong>. 
//               This platform will help you manage resident care, document activities, and collaborate with your team.
//             </p>
            
//             <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #667eea;">
//               <h3 style="color: #333; margin-top: 0;">Your Role & Locations:</h3>
//               <p style="margin: 5px 0;"><strong>Role:</strong> ${employee.role.charAt(0).toUpperCase() + employee.role.slice(1)}</p>
//               <p style="margin: 5px 0;"><strong>Assigned Locations:</strong> ${employee.locations.length > 0 ? employee.locations.join(', ') : 'None assigned yet'}</p>
//             </div>
            
//             <div style="text-align: center; margin: 30px 0;">
//               <a href="${inviteUrl}" 
//                  style="background: #667eea; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
//                 Accept Invitation & Set Password
//               </a>
//             </div>
            
//             <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
//               <p style="margin: 0; color: #856404; font-size: 14px;">
//                 <strong>⏰ Important:</strong> This invitation expires in 24 hours. Please accept it soon to get started.
//               </p>
//             </div>
            
//             <h3 style="color: #333;">What's Next?</h3>
//             <ol style="color: #555; line-height: 1.6;">
//               <li>Click the invitation link above</li>
//               <li>Create your secure password</li>
//               <li>Complete your profile setup</li>
//               <li>Start managing resident care</li>
//             </ol>
            
//             <p style="color: #555; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
//               If you have any questions or need help getting started, please contact your supervisor or system administrator.
//             </p>
            
//             <p style="color: #888; font-size: 12px; margin-top: 20px;">
//               If the button doesn't work, copy and paste this link into your browser:<br>
//               <a href="${inviteUrl}" style="color: #667eea; word-break: break-all;">${inviteUrl}</a>
//             </p>
            
//             <p style="color: #888; font-size: 12px; margin-top: 10px;">
//               <strong>Invite Token:</strong> ${args.inviteToken}
//             </p>
//           </div>
//         </div>
//       `;

// 			const {data, error} = await resend.emails.send({
// 				from:
// 					process.env.FROM_EMAIL ||
// 					'Care Team <noreply@caremanagement.example.com>',
// 				to: employee.email,
// 				subject: `Welcome to the Care Team - Complete Your Setup (Token: ${args.inviteToken})`,
// 				html: emailHtml,
// 			});

// 			console.log('Resend API response:', {data, error});

// 			if (error) {
// 				console.error('Failed to send invite email:', error);
// 				// Check if it's a domain restriction error
// 				if (error.message && error.message.includes('domain')) {
// 					throw new Error(
// 						`Email sending failed: The email address ${employee.email} may not be verified for sending. In the Chef environment, emails can only be sent to verified addresses.`
// 					);
// 				}
// 				throw new Error(
// 					'Failed to send invite email: ' + JSON.stringify(error)
// 				);
// 			}

// 			console.log('Invite email sent successfully:', data);
// 			return {success: true, emailId: data?.id};
// 		} catch (error) {
// 			console.error('Error sending invite email:', error);
// 			throw error; // Re-throw to see the actual error
// 		}
// 	},
// });
// // ===========================================================================================================================================================================================================

// import {internalAction} from './_generated/server';
// import {v} from 'convex/values';

// // ============================================================================
// // CLERK USER MANAGEMENT
// // ============================================================================

// /**
//  * Delete a Clerk user account
//  * Called internally when admin deletes an employee
//  * Note: This requires CLERK_SECRET_KEY environment variable
//  */
// export const deleteClerkUser = internalAction({
// 	args: {
// 		clerkUserId: v.string(),
// 	},
// 	handler: async (ctx, args) => {
// 		const clerkSecretKey = process.env.CLERK_SECRET_KEY;

// 		if (!clerkSecretKey) {
// 			console.error('CLERK_SECRET_KEY not configured');
// 			return {success: false, error: 'Clerk not configured'};
// 		}

// 		try {
// 			const response = await fetch(
// 				`https://api.clerk.com/v1/users/${args.clerkUserId}`,
// 				{
// 					method: 'DELETE',
// 					headers: {
// 						Authorization: `Bearer ${clerkSecretKey}`,
// 						'Content-Type': 'application/json',
// 					},
// 				}
// 			);

// 			if (!response.ok) {
// 				const error = await response.text();
// 				console.error('Clerk API error:', error);
// 				return {success: false, error: `Failed to delete user: ${error}`};
// 			}

// 			console.log('✅ Clerk user deleted successfully:', args.clerkUserId);
// 			return {success: true};
// 		} catch (error) {
// 			console.error('Failed to delete Clerk user:', error);
// 			return {
// 				success: false,
// 				error: error instanceof Error ? error.message : 'Unknown error',
// 			};
// 		}
// 	},
// });

// /**
//  * Note: We DON'T create Clerk users programmatically in the invite-based flow
//  *
//  * The employee creates their own account through Clerk's signup flow after
//  * accepting the invite. This is more secure and follows best practices.
//  *
//  * However, if you need programmatic user creation (legacy approach),
//  * here's the function for reference:
//  */

// /**
//  * Create a Clerk user account (NOT USED in invite-based flow)
//  * Keeping this for reference or legacy support
//  */
// export const createClerkUser = internalAction({
// 	args: {
// 		email: v.string(),
// 		password: v.string(),
// 		firstName: v.string(),
// 		lastName: v.string(),
// 	},
// 	handler: async (ctx, args) => {
// 		const clerkSecretKey = process.env.CLERK_SECRET_KEY;

// 		if (!clerkSecretKey) {
// 			console.error('CLERK_SECRET_KEY not configured');
// 			throw new Error('Clerk not configured');
// 		}

// 		try {
// 			const response = await fetch('https://api.clerk.com/v1/users', {
// 				method: 'POST',
// 				headers: {
// 					Authorization: `Bearer ${clerkSecretKey}`,
// 					'Content-Type': 'application/json',
// 				},
// 				body: JSON.stringify({
// 					email_address: [args.email],
// 					password: args.password,
// 					first_name: args.firstName,
// 					last_name: args.lastName,
// 					skip_password_checks: false,
// 					skip_password_requirement: false,
// 				}),
// 			});

// 			if (!response.ok) {
// 				const error = await response.text();
// 				console.error('Clerk API error:', error);
// 				throw new Error(`Failed to create Clerk user: ${error}`);
// 			}

// 			const data = await response.json();
// 			console.log('✅ Clerk user created successfully:', data.id);

// 			return {
// 				clerkUserId: data.id,
// 				email: data.email_addresses[0]?.email_address,
// 			};
// 		} catch (error) {
// 			console.error('Failed to create Clerk user:', error);
// 			throw error;
// 		}
// 	},
// });