import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {listActiveAlerts} from '@/db/queries/compliance';

export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const alerts = await listActiveAlerts(userId);
		return NextResponse.json(alerts);
	} catch (error: any) {
		console.error('Error getting active alerts:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to get active alerts'},
			{status: 500}
		);
	}
}
