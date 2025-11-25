import { NextRequest, NextResponse } from 'next/server';
import { requireCareAccess } from '@/lib/db-helpers';
import { getResidentAuditTrail } from '@/db/queries/care'; // Assuming this query exists or will be created
import { auth } from '@clerk/nextjs/server';

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    await requireCareAccess(userId);

    const { searchParams } = new URL(req.url);
    const residentId = searchParams.get('residentId');

    if (!residentId) {
      return NextResponse.json({ error: 'Resident ID is required' }, { status: 400 });
    }

    const auditLogs = await getResidentAuditTrail(userId, residentId);
    return NextResponse.json(auditLogs);
  } catch (error: any) {
    console.error('Error fetching resident audit trail:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
