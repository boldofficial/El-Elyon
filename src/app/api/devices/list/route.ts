import {NextRequest, NextResponse} from 'next/server';
import {listDevices} from '@/db/queries/devices';
import {auth} from '@clerk/nextjs/server';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const {searchParams} = req.nextUrl;
		const location = searchParams.get('location') || undefined;

		const devices = await listDevices(userId, location);

		return NextResponse.json(devices);
	} catch (error: any) {
		console.error('Error listing devices:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
