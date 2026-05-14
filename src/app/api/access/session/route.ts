import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getUserByClerkId} from '@/db/queries/users';
import {getEmployeeByClerkId} from '@/db/queries/employees';
import {getRoleByClerkId} from '@/db/queries/roles';
import {getAllLocations} from '@/db/queries/locations';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({
				authenticated: false,
				user: null,
				role: null,
				locations: [],
				defaultRoute: null,
				needsSync: false,
			});
		}

		// Get user data from all tables
		const [user, employee, role] = await Promise.all([
			getUserByClerkId(userId),
			getEmployeeByClerkId(userId),
			getRoleByClerkId(userId),
		]);

		// Check if user needs sync (missing records)
		const needsSync = !user || !employee || !role;

		if (needsSync) {
			console.log('⚠️  User incomplete - needs sync');
			return NextResponse.json({
				authenticated: true,
				role: null,
				locations: [],
				defaultRoute: null,
				needsSync: true,
			});
		}

		// Determine default route based on role
		let defaultRoute = '/';
		if (role.role === 'admin') {
			defaultRoute = '/admin';
		} else if (role.role === 'supervisor' || role.role === 'staff') {
			defaultRoute = '/care';
		}

		// Determine locations by merging role and employee locations
		let assignedLocations = Array.from(new Set([
			...(role.locations || []),
			...(employee.locations || [])
		]));
		
		// If admin, give access to all locations
		if (role.role === 'admin') {
			assignedLocations = await getAllLocations();
		}

		// Check if this is a kiosk session (based on device assignment)
		const isKiosk = employee.assignedDeviceId ? true : false;

		return NextResponse.json({
			authenticated: true,
			user: {
				id: user.id,
				clerkUserId: user.clerkUserId,
				name: user.name,
				email: user.email,
			},
			role: role.role,
			locations: assignedLocations,
			defaultRoute,
			employmentStatus: employee.employmentStatus,
			assignedDeviceId: employee.assignedDeviceId,
			isKiosk,
			needsSync: false,
		});
	} catch (error) {
		console.error('Error getting session:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
