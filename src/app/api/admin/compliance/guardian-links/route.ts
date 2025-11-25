import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {getGuardianChecklistLinks} from '@/db/queries/compliance';

export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const links = await getGuardianChecklistLinks(userId);
		return NextResponse.json(links);
	} catch (error: any) {
		console.error('Error getting guardian checklist links:', error);
		return NextResponse.json(
			{error: error.message || 'Failed to get guardian checklist links'},
			{status: 500}
		);
	}
}
