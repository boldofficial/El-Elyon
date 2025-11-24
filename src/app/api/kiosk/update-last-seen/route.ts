// ===================================
// Update kiosk last seen API
// ===================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {kiosks} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const {deviceId} = await req.json();

		await db
			.update(kiosks)
			.set({
				lastSeenAt: new Date(),
				lastHeartbeat: new Date(),
			})
			.where(eq(kiosks.deviceId, deviceId));

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error updating kiosk last seen:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
