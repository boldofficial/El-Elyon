// src/app/api/guardian-checklists/send/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {sendChecklistToGuardian} from '@/db/mutations/guardian-checklists';

export async function POST(req: NextRequest) {
  try {
    const {userId} = await auth();
    if (!userId) {
      return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    const body = await req.json();
    const {residentId, templateId, guardianEmail} = body;

    if (!residentId || !templateId || !guardianEmail) {
      return NextResponse.json(
        {error: 'residentId, templateId, and guardianEmail are required'},
        {status: 400}
      );
    }

    const result = await sendChecklistToGuardian(userId, {
      residentId,
      templateId,
      guardianEmail,
    });

    // Trigger email sending
    await fetch(
      `${process.env.NEXT_PUBLIC_SITE_URL}/api/internal/send-guardian-checklist-email`,
      {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          linkId: result.linkId,
          token: result.token,
        }),
      }
    );

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error sending checklist:', error);
    return NextResponse.json({error: error.message}, {status: 500});
  }
}
