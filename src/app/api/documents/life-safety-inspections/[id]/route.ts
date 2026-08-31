import {auth} from '@clerk/nextjs/server';
import {
	updateLifeSafetyInspection,
	voidLifeSafetyInspection,
} from '@/db/mutations/life-safety';
import {getLifeSafetyInspection} from '@/db/queries/life-safety';
import {
	lifeSafetyInspectionUpdateSchema,
	lifeSafetyRecordIdSchema,
	lifeSafetyRecordVoidSchema,
} from '@/lib/validation-schemas';
import {lifeSafetyErrorResponse, lifeSafetyJson, parseLifeSafetyJson} from '../../_life-safety-route';

type RouteContext = {params: Promise<{id: string}>};

export async function GET(_request: Request, {params}: RouteContext) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const id = lifeSafetyRecordIdSchema.parse((await params).id);
		return lifeSafetyJson(await getLifeSafetyInspection({clerkUserId: userId, id}));
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}

export async function PATCH(request: Request, {params}: RouteContext) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const id = lifeSafetyRecordIdSchema.parse((await params).id);
		const {expectedVersion, entry} = await parseLifeSafetyJson(request, lifeSafetyInspectionUpdateSchema);
		return lifeSafetyJson(
			await updateLifeSafetyInspection({clerkUserId: userId, id, expectedVersion, input: entry})
		);
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}

export async function DELETE(request: Request, {params}: RouteContext) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const id = lifeSafetyRecordIdSchema.parse((await params).id);
		const {expectedVersion, reason} = await parseLifeSafetyJson(request, lifeSafetyRecordVoidSchema);
		return lifeSafetyJson(
			await voidLifeSafetyInspection({clerkUserId: userId, id, expectedVersion, reason})
		);
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}
