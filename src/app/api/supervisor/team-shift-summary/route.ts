import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';
import {shifts} from '@/db/schema';
import {gte, lte, and, isNull} from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    await requireRole(['admin', 'supervisor']);

    const dateFrom = req.nextUrl.searchParams.get('dateFrom');
    const dateTo = req.nextUrl.searchParams.get('dateTo');

    const conditions = [];

    if (dateFrom) {
      conditions.push(gte(shifts.clockInTime, new Date(parseInt(dateFrom))));
    }
    if (dateTo) {
      conditions.push(lte(shifts.clockInTime, new Date(parseInt(dateTo))));
    }

    const allShifts = await db.query.shifts.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
    });

    const summary = allShifts.map((shift) => ({
      staffId: shift.clerkUserId,
      location: shift.location,
      isCurrentlyWorking: !shift.clockOutTime,
      duration: shift.clockOutTime
        ? new Date(shift.clockOutTime).getTime() -
          new Date(shift.clockInTime).getTime()
        : Date.now() - new Date(shift.clockInTime).getTime(),
    }));

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error getting shift summary:', error);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
}