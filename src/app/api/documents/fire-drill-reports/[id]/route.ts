import {auth} from '@clerk/nextjs/server';
import {updateFireDrillReport, voidFireDrillReport} from '@/db/mutations/life-safety';
import {getFireDrillReport} from '@/db/queries/life-safety';
import {
	fireDrillReportUpdateSchema,
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
		return lifeSafetyJson(await getFireDrillReport({clerkUserId: userId, id}));
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}

export async function PATCH(request: Request, {params}: RouteContext) {
	try {
		const {userId} = await auth();
		if (!userId) return lifeSafetyJson({error: 'Not authenticated'}, {status: 401});
		const id = lifeSafetyRecordIdSchema.parse((await params).id);
		const {expectedVersion, report} = await parseLifeSafetyJson(request, fireDrillReportUpdateSchema);
		return lifeSafetyJson(
			await updateFireDrillReport({clerkUserId: userId, id, expectedVersion, input: report})
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
			await voidFireDrillReport({clerkUserId: userId, id, expectedVersion, reason})
		);
	} catch (error) {
		return lifeSafetyErrorResponse(error);
	}
}
