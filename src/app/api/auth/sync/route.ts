import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getClerkUser} from '@/lib/clerk';
import {getUserByClerkId, createUser, updateUser} from '@/db/queries/users';
import {
	getEmployeeByClerkId,
	createEmployee,
	updateEmployee,
} from '@/db/queries/employees';
import {
	getRoleByClerkId,
	createRole,
	updateRole,
	checkForAdmins,
} from '@/db/queries/roles';

export async function POST() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		console.log('🔄 Auto-syncing user:', userId);

		// Fetch user data from Clerk
		const clerkUserData = await getClerkUser(userId);

		if (!clerkUserData) {
			return NextResponse.json(
				{error: 'Failed to fetch user from Clerk'},
				{status: 500}
			);
		}

		const {email, name, metadata} = clerkUserData;
		const role = metadata?.role || 'staff';
		const locations = metadata?.locations || [];
		const assignedDeviceId = metadata?.assignedDeviceId;

		// Check if first user
		const admins = await checkForAdmins();
		const isFirstUser = admins.length === 0;
		const finalRole = isFirstUser ? 'admin' : role;

		console.log(
			`${isFirstUser ? '🎖️  First user - creating admin' : '👤 Restoring user with role: ' + finalRole}`
		);

		// Create or update user
		const existingUser = await getUserByClerkId(userId);
		if (existingUser) {
			await updateUser(userId, {email, name, updatedAt: new Date()});
		} else {
			await createUser({
				clerkUserId: userId,
				email,
				name,
				createdAt: new Date(),
			});
		}

		// Create or update employee
		const existingEmployee = await getEmployeeByClerkId(userId);
		if (existingEmployee) {
			await updateEmployee(userId, {
				name,
				email,
				workEmail: email,
				role: finalRole,
				locations,
				assignedDeviceId,
				updatedAt: new Date(),
			});
		} else {
			await createEmployee({
				name,
				workEmail: email,
				email,
				clerkUserId: userId,
				role: finalRole,
				locations,
				employmentStatus: 'active',
				assignedDeviceId,
				createdAt: new Date(),
				onboardedAt: new Date(),
			});
		}

		// Create or update role
		const existingRole = await getRoleByClerkId(userId);
		if (existingRole) {
			await updateRole(userId, {
				role: finalRole,
				locations,
			});
		} else {
			await createRole({
				clerkUserId: userId,
				role: finalRole,
				locations,
				assignedAt: new Date(),
			});
		}

		console.log('✅ User sync complete');

		return NextResponse.json({
			success: true,
			isFirstAdmin: isFirstUser,
			role: finalRole,
			locations,
		});
	} catch (error) {
		console.error('Error syncing user:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
