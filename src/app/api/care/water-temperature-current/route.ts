import {auth} from '@clerk/nextjs/server';
import {getWaterTemperatureCheckForCurrentShift} from '@/db/queries/water-temperature';
import {
	waterTemperatureErrorResponse,
	waterTemperatureJson,
} from '../../documents/_water-temperature-route';

// No-query current-record endpoint for the staff entry/resume dialog (U4).
//
// This is the staff counterpart to the supervisor-only month listing
// (GET /api/documents/water-temperature-checks). The dialog previously used
// that month listing and filtered client-side for its own row, which required
// serving a care worker the whole house's month. This returns exactly the one
// active record for the caller's own obligation, or null when it is still
// outstanding.
//
// Like the status route, it reads no query or body: identity comes solely
// from the caller's own open, classified shift (R16), so there is no
// house/date/slot parameter for a client to override. Responses are private
// and non-cacheable (R18).
export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) return waterTemperatureJson({error: 'Not authenticated'}, {status: 401});

		const data = await getWaterTemperatureCheckForCurrentShift(userId);
		return waterTemperatureJson(data);
	} catch (error) {
		// Reuses the shared mapper so a missing shift surfaces as the same
		// typed 409 NO_ACTIVE_SHIFT the mutation routes return, and an
		// authorization failure surfaces as 403 rather than leaking detail.
		return waterTemperatureErrorResponse(error);
	}
}
