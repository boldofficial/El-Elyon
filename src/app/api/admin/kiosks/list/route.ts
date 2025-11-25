// src/app/admin/kiosks/list/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';
import {kiosks} from '@/db/schema';
import {eq} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		await requireRole(['admin']);

		const location = req.nextUrl.searchParams.get('location');

		let kiosksList;
		if (location) {
			kiosksList = await db.query.kiosks.findMany({
				where: eq(kiosks.location, location),
			});
		} else {
			kiosksList = await db.query.kiosks.findMany();
		}

		console.log(`📱 Found ${kiosksList.length} kiosk device(s)`);

		const formattedKiosks = kiosksList.map((k) => ({
			id: k.id,
			deviceId: k.deviceId,
			location: k.location,
			deviceLabel: k.deviceLabel || k.name,
			status: k.status,
			registeredAt: k.registeredAt,
		}));

		return NextResponse.json(formattedKiosks);
	} catch (error) {
		console.error('Error listing kiosks:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
