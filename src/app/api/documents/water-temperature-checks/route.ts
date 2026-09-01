import {auth} from '@clerk/nextjs/server';
import {
	createWaterTemperatureCheckFromShift,
	createWaterTemperatureCheckManual,
} from '@/db/mutations/water-temperature';
import {listWaterTemperatureChecksForMonth} from '@/db/queries/water-temperature';
import {
	waterTemperatureCreateRequestSchema,
	waterTemperatureMonthQuerySchema,
} from '@/lib/validation-schemas';
import {
	parseWaterTemperatureJson,
	waterTemperatureErrorResponse,
	waterTemperatureJson,
} from '../_water-temperature-route';

// GET: authorized month listing for the digital review/print workspace
// (U5). Location-scoped to the caller's authorized houses (R18); standard
// results exclude voided records unless includeVoided=true is requested.
export async function GET(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) return waterTemperatureJson({error: 'Not authenticated'}, {status: 401});
		const query = waterTemperatureMonthQuerySchema.parse(
			Object.fromEntries(new URL(request.url).searchParams)
		);
		const data = await listWaterTemperatureChecksForMonth({clerkUserId: userId, ...query});
		return waterTemperatureJson({data});
	} catch (error) {
		return waterTemperatureErrorResponse(error);
	}
}

// POST: two mutually exclusive creation paths, discriminated by `source`:
//   - "shift": staff create. Location/date/slot/staff identity are derived
//     exclusively from the caller's active, classified shift (R16) -- the
//     request body carries no identity fields at all.
//   - "manual": supervisor/admin reasoned backfill/missing-slot entry,
//     scoped to their currently authorized locations (R11).
export async function POST(request: Request) {
	try {
		const {userId} = await auth();
		if (!userId) return waterTemperatureJson({error: 'Not authenticated'}, {status: 401});
		const input = await parseWaterTemperatureJson(request, waterTemperatureCreateRequestSchema);

		const result =
			input.source === 'shift'
				? await createWaterTemperatureCheckFromShift({
						clerkUserId: userId,
						kitchenTempTenths: input.kitchenTempF,
						bathTempTenths: input.bathTempF,
						comments: input.comments,
						idempotencyKey: input.idempotencyKey,
					})
				: await createWaterTemperatureCheckManual({
						clerkUserId: userId,
						locationId: input.locationId,
						shiftSlot: input.shiftSlot,
						operationalDate: input.operationalDate,
						kitchenTempTenths: input.kitchenTempF,
						bathTempTenths: input.bathTempF,
						staffId: input.staffId,
						staffName: input.staffName,
						staffInitials: input.staffInitials,
						observedAt: input.observedAt,
						comments: input.comments,
						reason: input.reason,
						idempotencyKey: input.idempotencyKey,
					});

		return waterTemperatureJson(result, {status: 201});
	} catch (error) {
		return waterTemperatureErrorResponse(error);
	}
}
