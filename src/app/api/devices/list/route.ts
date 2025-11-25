import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {getRoleByClerkId} from '@/db/queries/roles';
import {listDevices} from '@/db/queries/devices';

export async function GET(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const role = await getRoleByClerkId(userId);
		if (role?.role !== 'admin') {
			return NextResponse.json(
				{error: 'Only admins can view devices'},
				{status: 403}
			);
		}

		const {searchParams} = new URL(req.url);
		const location = searchParams.get('location') || undefined;

		const devices = await listDevices(location);

		return NextResponse.json(devices);
	} catch (error) {
		console.error('Error listing devices:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
