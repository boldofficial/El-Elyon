import {auth} from '@clerk/nextjs/server';
import {getWaterTemperatureStatusForCurrentShift} from '@/db/queries/water-temperature';
import {NextResponse} from 'next/server';

// No-query current-status endpoint for the Care Portal reminder (R8/KTD5).
// Identity comes exclusively from the caller's own active, classified
// shift -- this route never reads request query/body, so a client cannot
// supply (and this handler cannot accidentally honor) a house/date/slot
// override (R16). The response is intentionally coarse: no temperatures,
// notes, predecessor identity, raw location ID, or record ID.
export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const status = await getWaterTemperatureStatusForCurrentShift(userId);

		return NextResponse.json(status, {
			status: 200,
			headers: {'Cache-Control': 'private, no-store'},
		});
	} catch (error) {
		console.error(
			'Water-temperature status request failed',
			error instanceof Error ? error.message : 'Unknown error'
		);
		// Fails visibly rather than defaulting to "complete": the client must
		// treat a 500 here as "unknown, retry" per R9.
		return NextResponse.json(
			{error: 'Internal server error'},
			{status: 500, headers: {'Cache-Control': 'private, no-store'}}
		);
	}
}
