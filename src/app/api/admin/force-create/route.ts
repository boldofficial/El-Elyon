// ====================================
// EMERGENCY: Force create admin for current user
// ====================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {
	getEmployeeByClerkId,
	createEmployee,
	updateEmployee,
} from '@/db/queries/employees';
import {getRoleByClerkId, createRole, updateRole} from '@/db/queries/roles';
import {getClerkUser} from '@/lib/clerk';

export async function POST() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
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
			await updateEmployee(userId, {
				role: 'admin',
				assignedDeviceId: undefined,
				updatedAt: new Date(),
			});
		} else {
			console.log('📝 Creating new employee record as admin');
			await createEmployee({
				name: name || email || 'Admin User',
				workEmail: email || 'admin@example.com',
				email: email || 'admin@example.com',
				clerkUserId: userId,
				role: 'admin',
				locations: [],
				employmentStatus: 'active',
				assignedDeviceId: undefined,
				createdAt: new Date(),
				onboardedAt: new Date(),
			});
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
