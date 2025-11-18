import {db} from '../index';
import {
	employees,
	roles,
	shifts,
	residentLogs,
	auditLogs,
	ispAccessLogs,
	ispAcknowledgments,
	complianceAlerts,
	residents,
	guardians,
	kiosks,
	users,
	hrFiles,
	hrFileLogs,
} from '../schema';
import {eq, and, or, isNull} from 'drizzle-orm';
import {generateToken, generatePassword} from '@/lib/utils';
import {
	getClerkUser,
	createClerkUser,
	updateClerkMetadata,
	deleteClerkUser,
} from '@/lib/clerk';
import {
	// sendInviteEmail,

	sendWelcomeEmailWithCredentials,
} from '@/lib/emails';
import {auth} from '@clerk/nextjs/server';
import {getUserRoleDoc, requireAdminAccess, logAudit} from '@/lib/db-helpers'; // Import from db-helpers

// Mutation: Accept invite by token (public for invite acceptance)
export async function acceptInvite(token: string) {
	console.log('Accepting invite for token:', token);

	const employee = await db.query.employees.findFirst({
		where: eq(employees.inviteToken, token),
	});

	if (!employee) {
		console.log('No employee found for token:', token);
		throw new Error('Invalid invite token');
	}

	if (
		!employee.inviteExpiresAt ||
		employee.inviteExpiresAt.getTime() < Date.now()
	) {
		console.log('Invite expired for employee:', employee.name);
		throw new Error('Invite expired');
	}

	if (employee.hasAcceptedInvite) {
		console.log('Invite already accepted for employee:', employee.name);
		throw new Error('Invite already accepted');
	}

	await db
		.update(employees)
		.set({
			hasAcceptedInvite: true,
			employmentStatus: 'active',
		})
		.where(eq(employees.id, employee.id));

	await logAudit({
		clerkUserId: null, // No clerkUserId yet for public invite acceptance
		event: 'accept_invite',
		details: `employeeId=${employee.id},token=${token}`,
		deviceId: 'system',
		location: '',
	});

	console.log('Successfully accepted invite for employee:', employee.name);

	return {
		success: true,
		employeeId: employee.id,
		email: employee.email,
		role: employee.role,
		locations: employee.locations || [],
	};
}

// Mutation: Link authenticated Clerk user to employee record and create role
export async function linkUserToEmployee(
	employeeId: string,
	clerkUserId: string,
	userEmail: string
) {
	const employee = await db.query.employees.findFirst({
		where: eq(employees.id, employeeId),
	});

	if (!employee) throw new Error('Employee not found');
	if (!employee.hasAcceptedInvite)
		throw new Error('Employee invite not accepted');

	// Check if Clerk user email matches employee email
	if (userEmail !== employee.email && userEmail !== employee.workEmail) {
		throw new Error('User email does not match employee email');
	}

	// Check if user already has a role
	const existingRole = await db.query.roles.findFirst({
		where: eq(roles.clerkUserId, clerkUserId),
	});

	if (existingRole) {
		throw new Error('User already has a role assigned');
	}

	// Create role based on employee record
	const roleToAssign = employee.role || 'staff';
	const locationsToAssign = employee.locations || [];

	await db.insert(roles).values({
		clerkUserId,
		role: roleToAssign,
		locations: locationsToAssign,
		assignedAt: new Date(),
	});

	// Update employee record with Clerk user link
	await db
		.update(employees)
		.set({
			clerkUserId,
			onboardedBy: clerkUserId,
			onboardedAt: new Date(),
		})
		.where(eq(employees.id, employee.id));

	await logAudit({
		clerkUserId,
		event: 'link_user_to_employee',
		details: `employeeId=${employeeId},role=${roleToAssign}`,
		deviceId: 'system',
		location: '',
	});

	return {success: true, role: roleToAssign, locations: locationsToAssign};
}

// Mutation: Create employee with Clerk account (admin only)
export async function createEmployee(
	args: {
		name: string;
		email: string;
		role: 'admin' | 'supervisor' | 'staff';
		locations: string[];
		assignedDeviceId?: string;
	},
	adminClerkUserId: string
) {
	await requireAdminAccess(adminClerkUserId);

	// Check if employee with this email already exists
	const existingEmployee = await db.query.employees.findFirst({
		where: or(
			eq(employees.email, args.email),
			eq(employees.workEmail, args.email)
		),
	});

	if (existingEmployee) {
		throw new Error('Employee with this email already exists');
	}

	// Generate a secure random password
	const generatedPassword = generatePassword(16);

	console.log('🔐 Creating Clerk user for:', args.email);

	// Create Clerk user with metadata
	let clerkUser;
	try {
		clerkUser = await createClerkUser({
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

	// Create employee record directly (no webhook waiting needed with Drizzle)
	const [newEmployee] = await db
		.insert(employees)
		.values({
			name: args.name,
			email: args.email,
			workEmail: args.email,
			role: args.role,
			locations: args.locations,
			assignedDeviceId: args.assignedDeviceId,
			clerkUserId: clerkUserId,
			createdAt: new Date(),
			createdBy: adminClerkUserId,
			employmentStatus: 'pending', // Set to pending until invite accepted or manually activated
		})
		.returning();

	if (!newEmployee) {
		throw new Error('Failed to create employee record');
	}

	// Create role record
	await db.insert(roles).values({
		clerkUserId,
		role: args.role,
		locations: args.locations,
		assignedAt: new Date(),
		assignedBy: adminClerkUserId,
	});

	// Log audit
	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'create_employee',
		details: `employeeId=${newEmployee.id},clerkUserId=${clerkUserId},role=${args.role},assignedDeviceId=${args.assignedDeviceId || 'none'}`,
		deviceId: 'system',
		location: '',
	});

	// Send welcome email with credentials
	try {
		await sendWelcomeEmailWithCredentials({
			employeeId: newEmployee.id,
			email: args.email,
			password: generatedPassword,
		});
		console.log('📧 Scheduled welcome email with credentials for:', args.email);
	} catch (error) {
		console.error('❌ Failed to schedule welcome email:', error);
		// Don't throw - account was created successfully
	}

	return {
		success: true,
		clerkUserId: clerkUserId,
		generatedPassword,
	};
}

// Mutation: Update employee (admin only)
export async function updateEmployee(
	args: {
		employeeId: string;
		name: string;
		email: string;
		role: 'admin' | 'supervisor' | 'staff';
		locations: string[];
		assignedDeviceId?: string;
	},
	clerkUserId: string
) {
	await requireAdminAccess(clerkUserId);

	const employee = await db.query.employees.findFirst({
		where: eq(employees.id, args.employeeId),
	});
	if (!employee) throw new Error('Employee not found');

	// Update employee record
	await db
		.update(employees)
		.set({
			name: args.name,
			email: args.email,
			workEmail: args.email,
			role: args.role,
			locations: args.locations,
			updatedAt: new Date(),
			assignedDeviceId: args.assignedDeviceId,
		})
		.where(eq(employees.id, args.employeeId));

	// Update role if employee has clerkUserId
	if (employee.clerkUserId) {
		await db
			.update(roles)
			.set({
				role: args.role,
				locations: args.locations,
			})
			.where(eq(roles.clerkUserId, employee.clerkUserId));

		// Update Clerk metadata to keep in sync
		try {
			await updateClerkMetadata(employee.clerkUserId, {
				role: args.role,
				locations: args.locations,
				assignedDeviceId: args.assignedDeviceId,
			});
			console.log('✅ Clerk metadata updated');
		} catch (error) {
			console.error('❌ Failed to update Clerk metadata:', error);
			// Don't throw - local update succeeded
		}
	}

	await logAudit({
		clerkUserId,
		event: 'update_employee',
		details: `employeeId=${args.employeeId},role=${args.role},assignedDeviceId=${args.assignedDeviceId || 'none'}`,
		deviceId: 'system',
		location: '',
	});
	return {success: true};
}

// Mutation: Generate invite link for an employee (admin only)
export async function generateInviteLink(
	employeeId: string,
	adminClerkUserId: string
) {
	await requireAdminAccess(adminClerkUserId);

	const employee = await db.query.employees.findFirst({
		where: eq(employees.id, employeeId),
	});
	if (!employee) throw new Error('Employee not found');

	// Generate a new token and expiry (24h from now)
	const token = generateToken();
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

	await db
		.update(employees)
		.set({
			inviteToken: token,
			inviteExpiresAt: expiresAt,
			inviteResent: new Date(),
			hasAcceptedInvite: false,
			inviteBounced: false,
		})
		.where(eq(employees.id, employeeId));

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'generate_invite_link',
		details: `employeeId=${employeeId}`,
		deviceId: 'system',
		location: '',
	});

	// Send invite email
	try {
		await sendInviteEmail({
			employeeId: employee.id,
			email: employee.email || employee.workEmail || '',
			inviteToken: token,
		});
		console.log(
			'📧 Sent invite email for employee:',
			employee.id,
			'with token:',
			token
		);
	} catch (error) {
		console.error('❌ Failed to send invite email:', error);
		// Don't throw here, still return the token so admin can manually share
	}

	// Build invite URL - use process.env.NEXT_PUBLIC_SITE_URL in production
	const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
	const inviteUrl = `${baseUrl}/?invite=${token}`;

	return {token, expiresAt, url: inviteUrl};
}

// Mutation: Delete employee with cascade (admin only)
export async function deleteEmployee(employeeId: string, clerkUserId: string) {
	await requireAdminAccess(clerkUserId);

	const employee = await db.query.employees.findFirst({
		where: eq(employees.id, employeeId),
	});
	if (!employee) throw new Error('Employee not found');

	let linkedClerkUserId: string | null = null;
	if (employee.clerkUserId) {
		linkedClerkUserId = employee.clerkUserId;
	}

	if (linkedClerkUserId) {
		// Delete all related records
		await db.delete(roles).where(eq(roles.clerkUserId, linkedClerkUserId));
		await db.delete(shifts).where(eq(shifts.clerkUserId, linkedClerkUserId));
		await db
			.delete(residentLogs)
			.where(eq(residentLogs.authorId, linkedClerkUserId));
		await db
			.delete(auditLogs)
			.where(eq(auditLogs.clerkUserId, linkedClerkUserId));
		await db
			.delete(ispAccessLogs)
			.where(eq(ispAccessLogs.clerkUserId, linkedClerkUserId));
		await db
			.delete(ispAcknowledgments)
			.where(eq(ispAcknowledgments.clerkUserId, linkedClerkUserId));

		// For compliance alerts, set dismissedBy to undefined
		await db
			.update(complianceAlerts)
			.set({dismissedBy: null})
			.where(eq(complianceAlerts.dismissedBy, linkedClerkUserId));

		// For residents and guardians, set createdBy to undefined
		await db
			.update(residents)
			.set({createdBy: null})
			.where(eq(residents.createdBy, linkedClerkUserId));
		await db
			.update(guardians)
			.set({createdBy: null})
			.where(eq(guardians.createdBy, linkedClerkUserId));

		// For kiosks, set createdBy and registeredBy to undefined
		await db
			.update(kiosks)
			.set({createdBy: null, registeredBy: null})
			.where(
				or(
					eq(kiosks.createdBy, linkedClerkUserId),
					eq(kiosks.registeredBy, linkedClerkUserId)
				)
			);

		await db.delete(users).where(eq(users.clerkUserId, linkedClerkUserId));

		// Schedule deletion of Clerk user account
		try {
			await deleteClerkUser(linkedClerkUserId);
			console.log('✅ Deleted Clerk user:', linkedClerkUserId);
		} catch (error) {
			console.error('❌ Failed to delete Clerk user:', error);
		}
	}

	// Delete the employee record
	await db.delete(employees).where(eq(employees.id, employeeId));

	await logAudit({
		clerkUserId,
		event: 'delete_employee',
		details: `employeeId=${employeeId},linkedClerkUserId=${linkedClerkUserId || 'none'}`,
		deviceId: 'system',
		location: '',
	});
	return {success: true};
}
