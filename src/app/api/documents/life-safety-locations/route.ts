import {auth} from '@clerk/nextjs/server';
import {listAuthorizedLifeSafetyLocations} from '@/db/queries/life-safety';
import {lifeSafetyErrorResponse, lifeSafetyJson} from '../_life-safety-route';

export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		return lifeSafetyJson({
			data: await listAuthorizedLifeSafetyLocations({clerkUserId: userId}),
		});
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}
