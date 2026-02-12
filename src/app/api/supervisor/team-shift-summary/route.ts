import {NextRequest, NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';
import {residentLogs, shifts} from '@/db/schema';
import {and, gte, inArray, lte} from 'drizzle-orm';

export async function GET(req: NextRequest) {
  try {
    const user = await requireRole(['admin', 'supervisor']);

    const searchParams = req.nextUrl.searchParams;
    const dateFrom = searchParams.get('dateFrom');
    const dateTo = searchParams.get('dateTo');
    const locationParam = searchParams.get('location');

    const conditions: any[] = [];

    if (dateFrom) {
      conditions.push(gte(shifts.clockInTime, new Date(parseInt(dateFrom))));
    }
    if (dateTo) {
      conditions.push(lte(shifts.clockInTime, new Date(parseInt(dateTo))));
    }
    if (locationParam && locationParam !== 'all') {
      conditions.push(inArray(shifts.location, [locationParam]));
    } else if (user.role !== 'admin' && (user.locations || []).length > 0) {
      conditions.push(inArray(shifts.location, user.locations || []));
    }

    const allShifts = await db.query.shifts.findMany({
      where: conditions.length > 0 ? and(...conditions) : undefined,
      orderBy: (shifts, {desc}) => desc(shifts.clockInTime),
    });

    const shiftIds = allShifts.map((shift) => shift.id).filter(Boolean) as string[];
    const logCountsByShift: Record<string, number> = {};

    if (shiftIds.length > 0) {
      const logs = await db.query.residentLogs.findMany({
        where: inArray(residentLogs.shiftId, shiftIds),
      });

      for (const log of logs) {
        const key = log.shiftId as string;
        logCountsByShift[key] = (logCountsByShift[key] || 0) + 1;
      }
    }

    const summary = allShifts.map((shift) => ({
      staffId: shift.clerkUserId,
      location: shift.location,
      shiftId: shift.id,
      clockInTime: shift.clockInTime,
      clockOutTime: shift.clockOutTime,
      isCurrentlyWorking: !shift.clockOutTime,
      duration: shift.clockOutTime
        ? new Date(shift.clockOutTime).getTime() -
          new Date(shift.clockInTime).getTime()
        : Date.now() - new Date(shift.clockInTime).getTime(),
      logCount: logCountsByShift[shift.id] || 0,
    }));

    return NextResponse.json(summary);
  } catch (error) {
    console.error('Error getting shift summary:', error);
    return NextResponse.json({error: 'Internal server error'}, {status: 500});
  }
}