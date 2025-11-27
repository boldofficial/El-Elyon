// src/app/api/guardian-checklists/links/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {listChecklistLinks} from '@/db/queries/guardian-checklists';

export async function GET(req: NextRequest) {
  try {
    const {userId} = await auth();
    if (!userId) {
      return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    const residentId = req.nextUrl.searchParams.get('residentId') || undefined;
    const completedOnly =
      req.nextUrl.searchParams.get('completedOnly') === 'true';
    const pendingOnly = req.nextUrl.searchParams.get('pendingOnly') === 'true';

    const links = await listChecklistLinks(userId, {
      residentId,
      completedOnly,
      pendingOnly,
    });

    return NextResponse.json(links);
  } catch (error: any) {
    console.error('Error listing links:', error);
    return NextResponse.json({error: error.message}, {status: 500});
  }
}
