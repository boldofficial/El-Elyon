// ==================================
// Get current user API
// ====================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getFullUserData} from '@/db/queries/users';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json(null);
		}

		const userData = await getFullUserData(userId);
		return NextResponse.json(userData);
	} catch (error) {
		console.error('Error getting current user:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
