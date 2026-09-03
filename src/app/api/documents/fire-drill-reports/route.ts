import {auth} from '@clerk/nextjs/server';
import {createFireDrillReport} from '@/db/mutations/life-safety';
import {listFireDrillReports} from '@/db/queries/life-safety';
import {fireDrillReportCreateSchema, lifeSafetyCollectionQuerySchema} from '@/lib/validation-schemas';
import {lifeSafetyErrorResponse, lifeSafetyJson, parseLifeSafetyJson} from '../_life-safety-route';

export async function GET(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const query = lifeSafetyCollectionQuerySchema.parse(
			Object.fromEntries(new URL(request.url).searchParams)
		);
		return lifeSafetyJson({data: await listFireDrillReports({clerkUserId: userId, ...query})});
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const input = await parseLifeSafetyJson(request, fireDrillReportCreateSchema);
		return lifeSafetyJson(await createFireDrillReport({clerkUserId: userId, input}), {status: 201});
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}
