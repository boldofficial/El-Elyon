// ====================================
// EMERGENCY: Force create admin for current user
// ====================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getEmployeeByClerkId} from '@/db/queries/employees';
import {createEmployee, updateEmployee} from '@/db/mutations/employees';
import {getRoleByClerkId} from '@/db/queries/roles';
import {getClerkUser} from '@/lib/clerk';
import { createRole, updateRole } from '@/db/mutations/roles';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		// SECURITY: Require bootstrap secret to prevent unauthorized privilege escalation
		const body = await req.json().catch(() => ({}));
		const providedSecret = body.secret || req.headers.get('x-bootstrap-secret');
		const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_SECRET;

		if (!bootstrapSecret) {
			return NextResponse.json(
				{error: 'Admin bootstrap not configured. Set ADMIN_BOOTSTRAP_SECRET env var.'},
				{status: 500}
			);
		}

		if (providedSecret !== bootstrapSecret) {
			console.log('🚨 UNAUTHORIZED force admin attempt by:', userId);
			return NextResponse.json(
				{error: 'Invalid bootstrap secret'},
				{status: 403}
			);
		}

		console.log('🚨 FORCE ADMIN for:', userId);

		// Get user info from Clerk
		const clerkUserData = await getClerkUser(userId);
		if (!clerkUserData) {
			return NextResponse.json(
				{error: 'Failed to fetch user from Clerk'},
				{status: 500}
			);
		}

		const {email, name} = clerkUserData;

		// Create or update employee record
		const existingEmployee = await getEmployeeByClerkId(userId);

		if (existingEmployee) {
			console.log('📝 Updating existing employee to admin');
			await updateEmployee(
				{
					employeeId: existingEmployee.id,
					name: existingEmployee.name || 'Admin User', // Provide fallback for name
					email: existingEmployee.email || 'admin@example.com', // Provide fallback for email
					role: 'admin',
					locations: existingEmployee.locations || [],
					assignedDeviceId: undefined,
				},
				userId
			);
		} else {
			console.log('📝 Creating new employee record as admin');
			await createEmployee(
				{
					name: name || email || 'Admin User',
					email: email || 'admin@example.com',
					role: 'admin',
					locations: [],
					assignedDeviceId: undefined,
				},
				userId
			);
		}

		// Create or update role
		const existingRole = await getRoleByClerkId(userId);

		if (existingRole) {
			console.log('🔧 Updating existing role to admin');
			await updateRole(userId, {
				role: 'admin',
				locations: [],
			});
		} else {
			console.log('➕ Creating new admin role');
			await createRole({
				clerkUserId: userId,
				role: 'admin',
				locations: [],
				assignedAt: new Date(),
			});
		}

		console.log('✅ Force admin creation complete!');
		return NextResponse.json({
			success: true,
			message: 'You are now an admin! Refresh the page.',
			clerkUserId: userId,
		});
	} catch (error) {
		console.error('Error force creating admin:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
