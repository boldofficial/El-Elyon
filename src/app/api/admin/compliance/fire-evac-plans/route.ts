import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {getFireEvacPlans} from '@/db/queries/compliance';

export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const plans = await getFireEvacPlans(userId);
		return NextResponse.json(plans);
	} catch (error: any) {
		console.error('Error getting fire evac plans:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to get fire evac plans'},
			{status: 500}
		);
	}
}
