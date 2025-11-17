import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {getComplianceOverview} from '@/db/queries/compliance';

export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const overview = await getComplianceOverview(userId);
		return NextResponse.json(overview);
	} catch (error: any) {
		console.error('Error getting compliance overview:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to get compliance overview'},
			{status: 500}
		);
	}
}
