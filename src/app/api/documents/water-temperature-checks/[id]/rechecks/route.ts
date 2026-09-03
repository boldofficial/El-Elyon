import {auth} from '@clerk/nextjs/server';
import {
	recordWaterTemperatureAction,
	recordWaterTemperatureRecheck,
	supersedeWaterTemperatureRecheck,
} from '@/db/mutations/water-temperature';
import {
	waterTemperatureRecheckRouteRequestSchema,
	waterTemperatureRecordIdSchema,
} from '@/lib/validation-schemas';
import {
	parseWaterTemperatureJson,
	waterTemperatureErrorResponse,
	waterTemperatureJson,
} from '../../../_water-temperature-route';

type RouteContext = {params: Promise<{id: string}>};

// POST: three staff/privileged append operations on one check, discriminated
// by `type`:
//   - "action": staff documents corrective action for an above-115F check
//     (action_required -> recheck_required). Requires an active shift whose
//     house/date/slot matches this check (replacement staff may act under
//     their own snapshot, R11).
//   - "recheck": staff appends an ordered, append-only recheck fact for one
//     fixture (recheck_required -> recheck_required | complete). Same
//     active-shift matching as "action".
//   - "supersede": privileged (supervisor/admin) reasoned correction of a
//     mistyped recheck; the original fact is preserved and marked
//     superseded rather than edited/deleted (KTD6).
export async function POST(request: Request, {params}: RouteContext) {
	try {
		const {userId} = await auth();
		if (!userId) return waterTemperatureJson({error: 'Not authenticated'}, {status: 401});
		const checkId = waterTemperatureRecordIdSchema.parse((await params).id);
		const input = await parseWaterTemperatureJson(request, waterTemperatureRecheckRouteRequestSchema);

		if (input.type === 'action') {
			const result = await recordWaterTemperatureAction({
				clerkUserId: userId,
				checkId,
				expectedVersion: input.expectedVersion,
				action: input.action,
				idempotencyKey: input.idempotencyKey,
			});
			return waterTemperatureJson(result);
		}

		if (input.type === 'recheck') {
			const result = await recordWaterTemperatureRecheck({
				clerkUserId: userId,
				checkId,
				expectedVersion: input.expectedVersion,
				fixture: input.fixture,
				tempTenths: input.tempF,
				measuredAt: input.measuredAt,
				idempotencyKey: input.idempotencyKey,
			});
			return waterTemperatureJson(result);
		}

		const result = await supersedeWaterTemperatureRecheck({
			clerkUserId: userId,
			checkId,
			recheckId: input.recheckId,
			expectedVersion: input.expectedVersion,
			reason: input.reason,
			idempotencyKey: input.idempotencyKey,
		});
		return waterTemperatureJson(result);
	} catch (error) {
		return waterTemperatureErrorResponse(error);
	}
}
