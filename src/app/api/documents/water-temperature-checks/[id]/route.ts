import {auth} from '@clerk/nextjs/server';
import {correctWaterTemperatureCheck, voidWaterTemperatureCheck} from '@/db/mutations/water-temperature';
import {getWaterTemperatureCheck} from '@/db/queries/water-temperature';
import {
	waterTemperatureCorrectionRequestSchema,
	waterTemperatureRecordIdSchema,
	waterTemperatureVoidRequestSchema,
} from '@/lib/validation-schemas';
import {
	parseWaterTemperatureJson,
	waterTemperatureErrorResponse,
	waterTemperatureJson,
} from '../../_water-temperature-route';

type RouteContext = {params: Promise<{id: string}>};

// GET: detail, scoped to the caller's authorized locations. Absent and
// unauthorized IDs return the same 404 (R18).
export async function GET(_request: Request, {params}: RouteContext) {
	try {
		const {userId} = await auth();
		if (!userId) return waterTemperatureJson({error: 'Not authenticated'}, {status: 401});
		const id = waterTemperatureRecordIdSchema.parse((await params).id);
		return waterTemperatureJson(await getWaterTemperatureCheck({clerkUserId: userId, id}));
	} catch (error) {
		return waterTemperatureErrorResponse(error);
	}
}

// PATCH: privileged (supervisor/admin) reasoned correction of the header's
// readings/comments/action. Requires expectedVersion + reason; preserves
// the prior aggregate in an append-only revision (R11).
export async function PATCH(request: Request, {params}: RouteContext) {
	try {
		const {userId} = await auth();
		if (!userId) return waterTemperatureJson({error: 'Not authenticated'}, {status: 401});
		const id = waterTemperatureRecordIdSchema.parse((await params).id);
		const input = await parseWaterTemperatureJson(request, waterTemperatureCorrectionRequestSchema);
		const result = await correctWaterTemperatureCheck({
			clerkUserId: userId,
			checkId: id,
			expectedVersion: input.expectedVersion,
			kitchenTempTenths: input.kitchenTempF,
			bathTempTenths: input.bathTempF,
			comments: input.comments,
			action: input.action,
			reason: input.reason,
			idempotencyKey: input.idempotencyKey,
		});
		return waterTemperatureJson(result);
	} catch (error) {
		return waterTemperatureErrorResponse(error);
	}
}

// DELETE: privileged (supervisor/admin) void. Reopens the house/date/slot
// obligation instead of deleting history (KTD6).
export async function DELETE(request: Request, {params}: RouteContext) {
	try {
		const {userId} = await auth();
		if (!userId) return waterTemperatureJson({error: 'Not authenticated'}, {status: 401});
		const id = waterTemperatureRecordIdSchema.parse((await params).id);
		const input = await parseWaterTemperatureJson(request, waterTemperatureVoidRequestSchema);
		const result = await voidWaterTemperatureCheck({
			clerkUserId: userId,
			checkId: id,
			expectedVersion: input.expectedVersion,
			reason: input.reason,
			idempotencyKey: input.idempotencyKey,
		});
		return waterTemperatureJson(result);
	} catch (error) {
		return waterTemperatureErrorResponse(error);
	}
}
