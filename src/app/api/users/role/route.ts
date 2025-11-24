// src/app/api/users/role/route.ts

// ===================================
// Get user role API
// ==================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getRoleByClerkId} from '@/db/queries/roles';

export async function GET() {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json(null);
	}
	try {
		const userRole = await getRoleByClerkId(userId);
		// return NextResponse.json(userRole);

		return NextResponse.json({
			role: userRole.role,
			locations: userRole.locations || [],
			isKiosk: false, // Kiosk mode is determined by route, not role
		});
	} catch (error) {
		console.error('Error getting user role:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
