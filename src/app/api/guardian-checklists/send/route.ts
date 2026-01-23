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

    console.log('📋 Creating checklist link for:', {residentId, templateId, guardianEmail});
    
    const result = await sendChecklistToGuardian(userId, {
      residentId,
      templateId,
      guardianEmail,
    });

    console.log('✅ Checklist link created:', result);

    // Trigger email sending
    const emailUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/api/internal/compliance/send-guardian-checklist-email`;
    console.log('📧 Sending email via:', emailUrl);
    
    try {
      const emailRes = await fetch(emailUrl, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          linkId: result.linkId,
          token: result.token,
        }),
      });

      const emailResult = await emailRes.json();
      console.log('📧 Email result:', emailResult);

      if (!emailResult.success) {
        console.error('❌ Email sending failed:', emailResult.error);
        // Still return success for link creation, but include email error
        return NextResponse.json({
          ...result,
          emailSent: false,
          emailError: emailResult.error,
        });
      }

      console.log('✅ Email sent successfully');
      return NextResponse.json({...result, emailSent: true});
    } catch (emailError: any) {
      console.error('❌ Exception sending email:', emailError);
      return NextResponse.json({
        ...result,
        emailSent: false,
        emailError: emailError.message,
      });
    }
  } catch (error: any) {
    console.error('❌ Error creating checklist:', error);
    return NextResponse.json({error: error.message}, {status: 500});
  }
}

