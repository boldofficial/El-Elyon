import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getUserByClerkId} from '@/db/queries/users';
import {getEmployeeByClerkId} from '@/db/queries/employees';
import {getRoleByClerkId} from '@/db/queries/roles';
import {getClerkUser} from '@/lib/clerk';

/**
 * Self-Healing Authentication Query
 * Called on every login to ensure user exists in database
 * Returns user status and whether sync is needed
 */
export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json(null);
		}

		// Get user info from Clerk (for fallback data)
		const clerkUserData = await getClerkUser(userId);
		const email = clerkUserData?.email || '';
		const name = clerkUserData?.name || email.split('@')[0] || 'User';

		console.log('🔍 Checking if user exists:', userId, email);

		// Check if user exists in all tables
		const [user, employee, role] = await Promise.all([
			getUserByClerkId(userId),
			getEmployeeByClerkId(userId),
			getRoleByClerkId(userId),
		]);

		// If all records exist, user is fully synced
		if (user && employee && role) {
			console.log('✅ User exists with role:', role.role);
			return NextResponse.json({
				exists: true,
				clerkUserId: userId,
				email: user.email,
				name: user.name,
				role: role.role,
				locations: role.locations || employee.locations || [],
				employmentStatus: employee.employmentStatus,
				needsSync: false,
			});
		}

		// User is missing some records - needs sync
		console.log(
			'⚠️  User incomplete:',
			'user=' + !!user,
			'employee=' + !!employee,
			'role=' + !!role
		);

		return NextResponse.json({
			exists: false,
			clerkUserId: userId,
			email: user?.email || email,
			name: user?.name || name,
			needsSync: true,
		});
	} catch (error) {
		console.error('Error checking user:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
