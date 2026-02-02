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
	getClerkUserByEmail,
} from '@/lib/clerk';
import {
	sendEmployeeInviteEmail,
	sendWelcomeEmailWithCredentials,
} from '@/lib/emails/employee';
import {auth} from '@clerk/nextjs/server';
import {getUserRoleDoc, requireAdminAccess, logAudit} from '@/lib/db-helpers'; // Import from db-helpers
import {checkForAdmins} from '../queries/roles';

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
		clerkUserId: null,
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

	if (userEmail !== employee.email && userEmail !== employee.workEmail) {
		throw new Error('User email does not match employee email');
	}

	const existingRole = await db.query.roles.findFirst({
		where: eq(roles.clerkUserId, clerkUserId),
	});

	if (existingRole) {
		throw new Error('User already has a role assigned');
	}

	const roleToAssign = employee.role || 'staff';
	const locationsToAssign = employee.locations || [];

	await db.insert(roles).values({
		clerkUserId,
		role: roleToAssign,
		locations: locationsToAssign,
		assignedAt: new Date(),
	});

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

// Mutation: Create employee with Clerk account (admin only, OR self-sync, OR first admin)
// ✅ FIX: Skip admin check if this is the first admin being created OR if user is syncing themselves

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
	// ✅ CRITICAL FIX: Check if this is first admin BEFORE requiring admin access
	const admins = await checkForAdmins();
	const isFirstAdmin = admins.length === 0;

	// ✅ FIX: Check if this is a self-sync (user creating their own employee record)
	// This happens when a user logs in and their Clerk metadata has role/locations but no employee record exists
	const clerkUser = await getClerkUser(adminClerkUserId);
	const isSelfSync = clerkUser?.email === args.email;

	// Only require admin access if NOT creating first admin AND NOT self-sync
	if (!isFirstAdmin && !isSelfSync) {
		await requireAdminAccess(adminClerkUserId);
	} else if (isFirstAdmin) {
		console.log('🎖️  Creating first admin - skipping admin check');
	} else if (isSelfSync) {
		console.log('✅ Self-sync allowed - user creating their own employee record');
	}

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

	let clerkUserId: string;

	// ✅ FIX: Check if Clerk user already exists
	const existingClerkUser = await getClerkUserByEmail(args.email);

	if (existingClerkUser) {
		console.log('✅ Existing Clerk user found:', existingClerkUser.id);
		clerkUserId = existingClerkUser.id;

		// Update metadata for existing user
		await updateClerkMetadata(clerkUserId, {
			role: args.role,
			locations: args.locations,
			assignedDeviceId: args.assignedDeviceId,
		});
	} else {
		// Create new Clerk user with metadata
		console.log('🔐 Creating new Clerk user...');

		try {
			const newClerkUser = await createClerkUser({
				email: args.email,
				password: generatedPassword,
				firstName: args.name.split(' ')[0] || '',
				lastName: args.name.split(' ').slice(1).join(' ') || '',
				role: args.role,
				locations: args.locations,
				assignedDeviceId: args.assignedDeviceId,
			});

			if (!newClerkUser || !newClerkUser.clerkUserId) {
				throw new Error('Failed to get Clerk user ID after creation');
			}

			clerkUserId = newClerkUser.clerkUserId;
			console.log('✅ New Clerk user created:', clerkUserId);
		} catch (error) {
			// ✅ COMPREHENSIVE ERROR DEBUGGING
			console.error('❌ Failed to create Clerk user - FULL ERROR DETAILS:');
			console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			
			// Log the entire error object
			console.error('📋 Full error object:', JSON.stringify(error, null, 2));
			
			// Log all error properties
			if (error && typeof error === 'object') {
				console.error('📋 Error keys:', Object.keys(error));
				console.error('📋 Error type:', typeof error);
				console.error('📋 Error constructor:', error.constructor?.name);
			}
			
			// Check if it's a Clerk error with the errors array
			if (error && typeof error === 'object' && 'errors' in error) {
				const clerkError = error as any;
				console.error('📋 Clerk error detected!');
				console.error('📋 Clerk errors array:', JSON.stringify(clerkError.errors, null, 2));
				console.error('📋 Clerk code:', clerkError.code);
				console.error('📋 Clerk status:', clerkError.status);
				console.error('📋 Clerk message:', clerkError.message);
				console.error('📋 Clerk longMessage:', clerkError.longMessage);
				console.error('📋 Clerk traceId:', clerkError.clerkTraceId);
				
				// Extract human-readable error messages
				if (Array.isArray(clerkError.errors)) {
					const errorMessages = clerkError.errors
						.map((e: any) => {
							console.error('  → Error item:', JSON.stringify(e, null, 2));
							return e.message || e.long_message || e.code;
						})
						.filter(Boolean)
						.join('; ');
					
					console.error('📋 Extracted error messages:', errorMessages);
					console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
					
					throw new Error(`Clerk validation error: ${errorMessages}`);
				}
			}
			
			// Log standard error properties
			if (error instanceof Error) {
				console.error('📋 Error.message:', error.message);
				console.error('📋 Error.name:', error.name);
				console.error('📋 Error.stack:', error.stack);
			}
			
			console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
			
			// Throw a cleaner error message
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to create employee account: ${errorMessage}`);
		}
	}

	// ✅ Wait for webhook to process (give it 2 seconds)
	console.log('⏳ Waiting for webhook to create records...');
	await new Promise((resolve) => setTimeout(resolve, 2000));

	// Create employee record (webhook should have already created it)
	const existingWebhookEmployee = await db.query.employees.findFirst({
		where: eq(employees.clerkUserId, clerkUserId),
	});

	if (existingWebhookEmployee) {
		console.log('✅ Webhook already created employee record');

		// Send welcome email
		try {
			await sendWelcomeEmailWithCredentials({
				employeeId: existingWebhookEmployee.id,
				email: args.email,
				password: generatedPassword,
			});
			console.log('📧 Sent welcome email with credentials for:', args.email);
		} catch (error) {
			console.error('❌ Failed to send welcome email:', error);
		}

		return {
			success: true,
			clerkUserId: clerkUserId,
			generatedPassword,
		};
	}

	// ✅ Fallback: If webhook failed, create manually
	console.log("⚠️  Webhook didn't create employee, creating manually...");

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
			employmentStatus: isFirstAdmin ? 'active' : 'pending',
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

	// Send welcome email
	try {
		await sendWelcomeEmailWithCredentials({
			employeeId: newEmployee.id,
			email: args.email,
			password: generatedPassword,
		});
		console.log('📧 Sent welcome email with credentials for:', args.email);
	} catch (error) {
		console.error('❌ Failed to send welcome email:', error);
	}

	return {
		success: true,
		clerkUserId: clerkUserId,
		generatedPassword,
	};
}

// Mutation: Update employee (admin only, OR self-update during sync)
export async function updateEmployee(
	args: {
		employeeId: string;
		name: string;
		email: string;
		role: 'admin' | 'supervisor' | 'staff';
		locations: string[];
		assignedDeviceId?: string;
		// NEW HR FIELDS
		dateOfHire?: Date;
		tbTestFileId?: string;
		tbTestExpiresAt?: Date;
		backgroundCheckFileId?: string;
		backgroundCheckExpiresAt?: Date;
		applicationFormFileId?: string;
		personalBio?: string;
	},
	clerkUserId: string
) {
	const employee = await db.query.employees.findFirst({
		where: eq(employees.id, args.employeeId),
	});
	if (!employee) throw new Error('Employee not found');

	// ✅ CRITICAL FIX: Allow self-updates during sync (user updating their own record)
	const isSelfUpdate = employee.clerkUserId === clerkUserId;
	if (!isSelfUpdate) {
		await requireAdminAccess(clerkUserId);
	} else {
		console.log('✅ Self-update allowed for user:', clerkUserId);
	}

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
			dateOfHire: args.dateOfHire,
			tbTestFileId: args.tbTestFileId,
			tbTestExpiresAt: args.tbTestExpiresAt,
			backgroundCheckFileId: args.backgroundCheckFileId,
			backgroundCheckExpiresAt: args.backgroundCheckExpiresAt,
			applicationFormFileId: args.applicationFormFileId,
			personalBio: args.personalBio,
		})
		.where(eq(employees.id, args.employeeId));

	if (employee.clerkUserId) {
		await db
			.update(roles)
			.set({
				role: args.role,
				locations: args.locations,
			})
			.where(eq(roles.clerkUserId, employee.clerkUserId));

		try {
			await updateClerkMetadata(employee.clerkUserId, {
				role: args.role,
				locations: args.locations,
				assignedDeviceId: args.assignedDeviceId,
			});
			console.log('✅ Clerk metadata updated');
		} catch (error) {
			console.error('❌ Failed to update Clerk metadata:', error);
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

	const token = generateToken();
	const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

	await db
		.update(employees)
		.set({
			inviteToken: token,
			inviteExpiresAt: expiresAt,
			// inviteResent: new Date(),
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
		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
		const inviteUrl = `${baseUrl}/?invite=${token}`;

		await sendEmployeeInviteEmail({
			email: employee.email || employee.workEmail || '',
			name: employee.name,
			inviteUrl: inviteUrl,
			role: employee.role as 'admin' | 'supervisor' | 'staff', // Assuming employee.role is one of these
			locations: employee.locations || [],
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

		await db
			.update(complianceAlerts)
			.set({dismissedBy: null})
			.where(eq(complianceAlerts.dismissedBy, linkedClerkUserId));

		await db
			.update(residents)
			.set({createdBy: null})
			.where(eq(residents.createdBy, linkedClerkUserId));
		await db
			.update(guardians)
			.set({createdBy: null})
			.where(eq(guardians.createdBy, linkedClerkUserId));

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

		try {
			await deleteClerkUser(linkedClerkUserId);
			console.log('✅ Deleted Clerk user:', linkedClerkUserId);
		} catch (error) {
			console.error('❌ Failed to delete Clerk user:', error);
		}
	}

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
