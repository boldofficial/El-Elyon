import {db} from '../index';
import {employees, roles, locations} from '../schema';
import {eq, or} from 'drizzle-orm';
import {getUserRoleDoc} from '@/lib/db-helpers'; // Only getUserRoleDoc is needed here, requireAdminQuery is local

// Helper: Check admin access (for queries - no audit)
async function requireAdminQuery(clerkUserId: string) {
	const userRole = await getUserRoleDoc(clerkUserId);
	if (!userRole || userRole.role !== 'admin') {
		throw new Error('Admin access required');
	}
	return userRole;
}

// Query: Check if any admin user exists in the system
export async function hasAdminUser() {
	const adminRole = await db.query.roles.findFirst({
		where: eq(roles.role, 'admin'),
	});
	console.log('🔍 hasAdminUser:', adminRole !== undefined);
	return adminRole !== undefined;
}

// Query: List all employees with mapped fields for frontend (admin only)
export async function listEmployees(clerkUserId: string) {
	await requireAdminQuery(clerkUserId);

	const employeesList = await db.query.employees.findMany();
	return employeesList.map((emp) => ({
		id: emp.id,
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
}

// Query: Get available locations (accessible to care staff)
export async function getAvailableLocations(clerkUserId: string) {
	// Allow access to care staff and admins
	const userRole = await getUserRoleDoc(clerkUserId);
	if (
		!userRole ||
		!['admin', 'supervisor', 'staff'].includes(userRole.role || '')
	) {
		throw new Error('Care access required');
	}

	// Get active locations from the locations table
	const activeLocations = await db.query.locations.findMany({
		where: eq(locations.status, 'active'),
		columns: {
			name: true,
		},
	});

	return activeLocations.map((loc) => loc.name).sort();
}

// Query: Check if authenticated user needs to be linked to employee
export async function checkUserEmployeeLink(clerkUserId: string) {
	// Check if user already has a role
	const existingRole = await getUserRoleDoc(clerkUserId);
	if (existingRole) return null; // User already has role

	// Look for employee record with matching clerkUserId that has accepted invite
	const employee = await db.query.employees.findFirst({
		where: eq(employees.clerkUserId, clerkUserId),
	});

	if (!employee || !employee.hasAcceptedInvite) return null;

	return {
		employeeId: employee.id,
		name: employee.name,
		role: employee.role,
		locations: employee.locations || [],
	};
}

// Query: Check device authorization
export async function checkDeviceAuthorization(clerkUserId: string, deviceId: string) {
	const employee = await db.query.employees.findFirst({
		where: eq(employees.clerkUserId, clerkUserId),
	});

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
	if (employee.assignedDeviceId === deviceId) {
		console.log('✅ Device matches - access granted');
		return {isAuthorized: true};
	} else {
		console.log('❌ Device mismatch - access denied');
		return {
			isAuthorized: false,
			reason: 'Device not assigned to this employee',
		};
	}
}

// Query: Get invite link for an employee (admin only)
export async function getInviteLink(employeeId: string, clerkUserId: string) {
	await requireAdminQuery(clerkUserId);

	const employee = await db.query.employees.findFirst({
		where: eq(employees.id, employeeId),
	});
	if (!employee || !employee.inviteToken || !employee.inviteExpiresAt)
		return null;
	if (employee.hasAcceptedInvite) return null;
	if (employee.inviteExpiresAt.getTime() < Date.now()) return null;

	// Build invite URL - use process.env.NEXT_PUBLIC_SITE_URL in production
	const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';
	const inviteUrl = `${baseUrl}/?invite=${employee.inviteToken}`;
	return {
		url: inviteUrl,
		expiresAt: employee.inviteExpiresAt,
		token: employee.inviteToken,
	};
}

// Query: Get invite details by token (public for invite acceptance)
export async function getInviteDetails(token: string) {
	console.log('Getting invite details for token:', token);

	const employee = await db.query.employees.findFirst({
		where: eq(employees.inviteToken, token),
	});

	console.log('Found employee for token:', employee ? employee.name : 'none');

	if (!employee) {
		console.log('No employee found with token:', token);
		return null;
	}

	const expired =
		!employee.inviteExpiresAt || employee.inviteExpiresAt.getTime() < Date.now();
	console.log(
		'Invite expired:',
		expired,
		'expiresAt:',
		employee.inviteExpiresAt
	);

	return {
		id: employee.id,
		name: employee.name,
		email: employee.email,
		expired,
		hasAcceptedInvite: !!employee.hasAcceptedInvite,
		expiresAt: employee.inviteExpiresAt,
		clerkUserId: employee.clerkUserId,
	};
}

// Internal query to get employee for email
export async function getEmployeeForEmail(employeeId: string) {
	const employee = await db.query.employees.findFirst({
		where: eq(employees.id, employeeId),
	});
	if (!employee) return null;

	return {
		name: employee.name,
		email: employee.email || employee.workEmail || '',
		role: employee.role || 'staff',
		locations: employee.locations || [],
	};
}

// Internal query to get employee by email (for createEmployee action)
export async function getEmployeeByEmail(email: string) {
	return await db.query.employees.findFirst({
		where: or(
			eq(employees.email, email),
			eq(employees.workEmail, email)
		),
	});
}

// Internal query to get employee by Clerk user ID
export async function getEmployeeByClerkUserId(clerkUserId: string) {
	return await db.query.employees.findFirst({
		where: eq(employees.clerkUserId, clerkUserId),
	});
}

// Internal query to check if any admins exist
export async function checkForAdmins() {
	return await db.query.roles.findMany({
		where: eq(roles.role, 'admin'),
	});
}

// Existing functions (kept for now, will be reviewed for removal/refactor)
export async function getAllEmployees() {
	return await db.query.employees.findMany();
}

export async function getEmployeeByClerkId(clerkUserId: string) {
	return await db.query.employees.findFirst({
		where: eq(employees.clerkUserId, clerkUserId),
	});
}
