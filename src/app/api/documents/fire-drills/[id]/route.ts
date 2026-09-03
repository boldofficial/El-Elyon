import {auth} from '@clerk/nextjs/server';
import {getLegacyFireDrill} from '@/db/queries/life-safety';
import {lifeSafetyRecordIdSchema} from '@/lib/validation-schemas';
import {legacyWriteDenied, lifeSafetyErrorResponse, lifeSafetyJson} from '../../_life-safety-route';

type RouteContext = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: RouteContext) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const id = lifeSafetyRecordIdSchema.parse((await params).id);
		return lifeSafetyJson(await getLegacyFireDrill({clerkUserId: userId, id}));
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}

export async function POST() { return legacyWriteDenied(); }
export async function PATCH() { return legacyWriteDenied(); }
export async function DELETE() { return legacyWriteDenied(); }
