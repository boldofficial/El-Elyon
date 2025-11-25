import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getFullUserData} from '@/db/queries/users';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({
				authenticated: false,
				user: null,
				role: null,
				locations: [],
				defaultRoute: '/',
			});
		}

		const userData = await getFullUserData(userId);

		if (!userData) {
			return NextResponse.json({
				authenticated: true,
				user: {id: userId},
				role: null,
				locations: [],
				defaultRoute: '/pending',
				needsSync: true,
			});
		}

		const defaultRoute =
			userData.role === 'admin'
				? '/admin'
				: userData.role === 'supervisor' || userData.role === 'staff'
					? '/care'
					: '/pending';

		return NextResponse.json({
			authenticated: true,
			user: {
				id: userData.clerkUserId,
				name: userData.name,
				email: userData.email,
			},
			role: userData.role,
			locations: userData.locations,
			defaultRoute,
			needsSync: false,
		});
	} catch (error) {
		console.error('Error getting session:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
