import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {dismissAlert} from '@/db/mutations/compliance';

export async function POST(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const {alertId} = await req.json();

		if (!alertId) {
			return NextResponse.json({error: 'alertId is required'}, {status: 400});
		}

		await dismissAlert(userId, alertId);
		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('Error dismissing alert:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to dismiss alert'},
			{status: 500}
		);
	}
}
