// ===================================
// Get kiosk by device ID API
// ===================================
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {db} from '@/db/index';
import {kiosks} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		// Require authentication to prevent information disclosure
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		const deviceId = req.nextUrl.searchParams.get('deviceId');

		if (!deviceId) {
			return NextResponse.json({error: 'Device ID required'}, {status: 400});
		}

		const kiosk = await db.query.kiosks.findFirst({
			where: eq(kiosks.deviceId, deviceId),
		});

		if (!kiosk) {
			return NextResponse.json(null);
		}

		return NextResponse.json({
			...kiosk,
			isActive: kiosk.active,
		});
	} catch (error) {
		console.error('Error getting kiosk:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
