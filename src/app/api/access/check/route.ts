// ==================================
// Access control check API
// =====================================
import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {getFullUserData} from '@/db/queries/users';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({
				granted: false,
				reason: 'not_authenticated',
				redirectTo: '/',
				userRole: null,
				locations: [],
			});
		}

		const route = req.nextUrl.searchParams.get('route');
		if (!route) {
			return NextResponse.json(
				{error: 'Route parameter required'},
				{status: 400}
			);
		}

		const userData = await getFullUserData(userId);

		if (!userData) {
			return NextResponse.json({
				granted: false,
				reason: 'user_not_found',
				redirectTo: '/',
				userRole: null,
				locations: [],
			});
		}

		const {role, locations} = userData;

		// Route access rules
		const adminRoutes = ['/admin', '/settings', '/people/employees'];
		const careRoutes = ['/care', '/residents', '/guardians'];
		const publicRoutes = ['/', '/pending'];

		let granted = false;
		let reason = '';
		let redirectTo = '';

		// Check if route is public
		if (publicRoutes.some((r) => route.startsWith(r))) {
			granted = true;
			reason = 'public_route';
		}
		// Admin access
		else if (adminRoutes.some((r) => route.startsWith(r))) {
			if (role === 'admin') {
				granted = true;
				reason = 'admin_access';
			} else {
				granted = false;
				reason = 'insufficient_privileges';
				redirectTo =
					role === 'supervisor' || role === 'staff' ? '/care' : '/pending';
			}
		}
		// Care portal access
		else if (careRoutes.some((r) => route.startsWith(r))) {
			if (role === 'supervisor' || role === 'staff') {
				granted = true;
				reason = 'care_access';
			} else if (role === 'admin') {
				granted = true;
				reason = 'admin_override';
			} else {
				granted = false;
				reason = 'insufficient_privileges';
				redirectTo = '/pending';
			}
		}
		// Default deny
		else {
			granted = false;
			reason = 'route_not_found';
			redirectTo =
				role === 'admin'
					? '/admin'
					: role === 'supervisor' || role === 'staff'
						? '/care'
						: '/pending';
		}

		return NextResponse.json({
			granted,
			reason,
			redirectTo,
			userRole: role,
			locations: locations || [],
			clerkUserId: userId,
			userName: userData.name || userData.email || 'Unknown',
		});
	} catch (error) {
		console.error('Error checking access:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
