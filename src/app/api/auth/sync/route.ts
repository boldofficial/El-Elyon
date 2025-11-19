import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getClerkUser} from '@/lib/clerk';
import {getEmployeeByClerkId} from '@/db/queries/employees';
import {createEmployee, updateEmployee} from '@/db/mutations/employees';
import {getRoleByClerkId, checkForAdmins} from '@/db/queries/roles';
import {getUserByClerkId} from '@/db/queries/users';
import {createUser, updateUser} from '@/db/mutations/users';
import {updateRole, createRole} from '@/db/mutations/roles';

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
		const metadataDeviceId = metadata?.assignedDeviceId;

		// Check if first user
		const admins = await checkForAdmins();
		const isFirstUser = admins.length === 0;
		const finalRole = isFirstUser ? 'admin' : role;

		// FIX: Admins get undefined assignedDeviceId (no device restriction)
		const assignedDeviceId =
			finalRole === 'admin' ? undefined : metadataDeviceId;

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
			await updateEmployee(
				{
					employeeId: existingEmployee.id,
					name,
					email,
					role: finalRole as 'admin' | 'supervisor' | 'staff',
					locations,
					assignedDeviceId,
				},
				userId
			);
		} else {
			await createEmployee(
				{
					name,
					email,
					role: finalRole as 'admin' | 'supervisor' | 'staff',
					locations,
					assignedDeviceId,
				},
				userId
			);
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
