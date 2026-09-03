import {auth} from '@clerk/nextjs/server';
import {createLifeSafetyInspection} from '@/db/mutations/life-safety';
import {listLifeSafetyInspections} from '@/db/queries/life-safety';
import {
	lifeSafetyCollectionQuerySchema,
	lifeSafetyInspectionCreateSchema,
} from '@/lib/validation-schemas';
import {lifeSafetyErrorResponse, lifeSafetyJson, parseLifeSafetyJson} from '../_life-safety-route';

export async function GET(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const query = lifeSafetyCollectionQuerySchema.parse(
			Object.fromEntries(new URL(request.url).searchParams)
		);
		return lifeSafetyJson({
			data: await listLifeSafetyInspections({clerkUserId: userId, ...query}),
		});
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}

export async function POST(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const input = await parseLifeSafetyJson(request, lifeSafetyInspectionCreateSchema);
		return lifeSafetyJson(
			await createLifeSafetyInspection({clerkUserId: userId, input}),
			{status: 201}
		);
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}
