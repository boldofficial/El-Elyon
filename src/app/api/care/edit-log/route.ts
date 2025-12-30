import { NextRequest, NextResponse } from 'next/server';
import { requireCareAccess } from '@/lib/db-helpers';
import { editResidentLog } from '@/db/mutations/care';
import { logAudit } from '@/lib/db-helpers';
import { auth, clerkClient } from '@clerk/nextjs/server';

async function handleEditLog(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userRole = await requireCareAccess(userId);
    const { logId, residentId, template, fields } = await req.json();

    if (!logId || !residentId || !template || !fields) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const client = await clerkClient();
    const clerkUser = await client.users.getUser(userId);
    const authorName = clerkUser.firstName && clerkUser.lastName 
      ? `${clerkUser.firstName} ${clerkUser.lastName}` 
      : clerkUser.username || 'Unknown User';

    const updatedLog = await editResidentLog({
      logId,
      residentId,
      template,
      fields,
      authorId: userId,
      authorName: authorName,
    });

    await logAudit({
      clerkUserId: userId,
      event: 'resident.log.edited',
      details: `Edited log for resident ${residentId} (Log ID: ${logId})`,
      deviceId: 'system',
      location: userRole.locations?.[0] || '',
    });

    return NextResponse.json(updatedLog);
  } catch (error: any) {
    console.error('Error editing resident log:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return handleEditLog(req);
}

export async function PATCH(req: NextRequest) {
  return handleEditLog(req);
}
