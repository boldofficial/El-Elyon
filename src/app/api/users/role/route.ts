// src/app/api/users/role/route.ts

// ===================================
// Get user role API
// ==================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getRoleByClerkId} from '@/db/queries/roles';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json(null);
		}

		const role = await getRoleByClerkId(userId);
		return NextResponse.json(role);
	} catch (error) {
		console.error('Error getting user role:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
