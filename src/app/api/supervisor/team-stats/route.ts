import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {requireSupervisorAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {shifts} from '@/db/schema';
import {and, gte, lte, inArray} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userRole = await requireSupervisorAccess(userId);
		const searchParams = req.nextUrl.searchParams;
		const dateFrom = searchParams.get('dateFrom');
		const dateTo = searchParams.get('dateTo');

		const conditions: any[] = [];
		const scopedLocations = userRole.locations || [];

		if (dateFrom) {
			conditions.push(gte(shifts.clockInTime, new Date(parseInt(dateFrom))));
		}
		if (dateTo) {
			conditions.push(lte(shifts.clockInTime, new Date(parseInt(dateTo))));
		}
		if (scopedLocations.length > 0 && userRole.role !== 'admin') {
			conditions.push(inArray(shifts.location, scopedLocations));
		}

		const scopedShifts = await db.query.shifts.findMany({
			where: conditions.length > 0 ? and(...conditions) : undefined,
		});

		return NextResponse.json({
			totalShifts: scopedShifts.length,
		});
	} catch (error) {
		console.error('Error getting team stats:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}