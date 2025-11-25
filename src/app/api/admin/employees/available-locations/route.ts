// src/app/api/admin/employees/available-locations/route.ts

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {getAvailableLocations} from '@/db/queries/employees';
import {logAudit} from '@/db/mutations/audit';

// GET /api/admin/employees/available-locations - Get available locations (accessible to care staff)
export async function GET() {
	try {
		const {userId} = await auth();
		if (!userId) {
			return new NextResponse('Unauthorized', {status: 401});
		}

		const locations = await getAvailableLocations(userId);
		return NextResponse.json(locations);
	} catch (error: any) {
		console.error('Error getting available locations:', error);
		await logAudit({
			clerkUserId: (await auth()).userId,
			event: 'get_available_locations_failed',
			details: `Error: ${error.message}`,
			deviceId: 'system',
			location: '',
		});
		return new NextResponse(error.message, {status: 500});
	}
}
