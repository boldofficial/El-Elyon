import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getFullUserData} from '@/db/queries/users';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userData = await getFullUserData(userId);
		return NextResponse.json(userData?.locations || []);
	} catch (error) {
		console.error('Error getting managed locations:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
