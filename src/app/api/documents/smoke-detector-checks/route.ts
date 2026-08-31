import {auth} from '@clerk/nextjs/server';
import {listLegacySmokeDetectorChecks} from '@/db/queries/life-safety';
import {lifeSafetyLegacyQuerySchema} from '@/lib/validation-schemas';
import {legacyWriteDenied, lifeSafetyErrorResponse, lifeSafetyJson} from '../_life-safety-route';

export async function GET(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const query = lifeSafetyLegacyQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
		return lifeSafetyJson(await listLegacySmokeDetectorChecks({
			clerkUserId: userId,
			location: query.location,
			year: query.year,
			month: query.month,
			cursor: query.cursor,
			limit: query.limit,
		}));
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}

export async function POST() { return legacyWriteDenied(); }
export async function PATCH() { return legacyWriteDenied(); }
export async function DELETE() { return legacyWriteDenied(); }
