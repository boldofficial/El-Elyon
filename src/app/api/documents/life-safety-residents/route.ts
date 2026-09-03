import {auth} from '@clerk/nextjs/server';
import {listLifeSafetyResidents} from '@/db/queries/life-safety';
import {lifeSafetyResidentQuerySchema} from '@/lib/validation-schemas';
import {lifeSafetyErrorResponse, lifeSafetyJson} from '../_life-safety-route';

export async function GET(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const query = lifeSafetyResidentQuerySchema.parse(
			Object.fromEntries(new URL(request.url).searchParams)
		);
		return lifeSafetyJson({data: await listLifeSafetyResidents({clerkUserId: userId, ...query})});
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}
