// =====================================
// Create the first admin user (only works if no admin exists)
// ====================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {checkForAdmins} from '@/db/queries/roles';
import {getUserByClerkId, createUser} from '@/db/queries/users';
import {getEmployeeByClerkId, createEmployee} from '@/db/queries/employees';
import {createRole} from '@/db/queries/roles';
import {getClerkUser} from '@/lib/clerk';

export async function POST() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		console.log('🔐 Creating first admin for:', userId);

		// Check if any admin already exists
		const admins = await checkForAdmins();
		if (admins.length > 0) {
			return NextResponse.json(
				{error: 'An admin user already exists'},
				{status: 400}
			);
		}

		// Get user info from Clerk
		const clerkUserData = await getClerkUser(userId);
		if (!clerkUserData) {
			return NextResponse.json(
				{error: 'Failed to fetch user from Clerk'},
				{status: 500}
			);
		}

		const {email, name} = clerkUserData;

		// Check if employee record exists
		const employee = await getEmployeeByClerkId(userId);

		// Create employee record if it doesn't exist
		if (!employee) {
			console.log('📝 Creating employee record for first admin');
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

		// Create admin role
		await createRole({
			clerkUserId: userId,
			role: 'admin',
			locations: [],
			assignedAt: new Date(),
		});

		// Create admin user
		await createUser({
			clerkUserId: userId,
			email: email || 'admin@example.com',
			name: name || 'Admin User',
			createdAt: new Date(),
		});

		console.log('✅ First admin created successfully');
		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error creating first admin:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
