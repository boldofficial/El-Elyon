import {Resend} from 'resend';
import {db} from '@/db/index';
import {guardianChecklistLinks, guardianChecklistTemplates, residents} from '@/db/schema';
import {eq} from 'drizzle-orm';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail =
	process.env.FROM_EMAIL || 'El-Elyon Properties <noreply@yourdomain.com>';
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

export async function sendGuardianChecklistEmail(
	linkId: string,
	token: string
) {
	try {
		const link = await db.query.guardianChecklistLinks.findFirst({
			where: eq(guardianChecklistLinks.id, linkId),
		});

		if (!link) {
			throw new Error('Link not found');
		}

		const template = await db.query.guardianChecklistTemplates.findFirst({
			where: eq(guardianChecklistTemplates.id, link.templateId),
		});

		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, link.residentId),
		});

		if (!template || !resident) {
			throw new Error('Template or resident not found');
		}

		const checklistUrl = `${baseUrl}/?checklist=${token}`;

		const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">📋 Guardian Checklist</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <h2 style="color: #333; margin-top: 0;">Hello,</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            You have been sent a checklist to complete for <strong>${resident.name}</strong>.
          </p>
          
          <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
            <h3 style="color: #333; margin-top: 0;">Checklist Details:</h3>
            <p style="margin: 5px 0;"><strong>Template:</strong> ${template.name}</p>
            <p style="margin: 5px 0;"><strong>Resident:</strong> ${resident.name}</p>
            <p style="margin: 5px 0;"><strong>Questions:</strong> ${template.questions?.length || 0}</p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${checklistUrl}" 
               style="background: #2563eb; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
              Complete Checklist
            </a>
          </div>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; color: #856404; font-size: 14px;">
              <strong>⏰ Important:</strong> This link will expire in 30 days. Please complete the checklist before then.
            </p>
          </div>
          
          <h3 style="color: #333;">What to Expect:</h3>
          <ol style="color: #555; line-height: 1.6;">
            <li>Click the button above to access the checklist</li>
            <li>Answer all required questions</li>
            <li>Submit your responses</li>
            <li>You'll receive a confirmation</li>
          </ol>
          
          <p style="color: #555; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            If you have any questions about this checklist, please contact the care facility directly.
          </p>
          
          <p style="color: #888; font-size: 12px; margin-top: 20px;">
            If the button doesn't work, copy and paste this link into your browser:<br>
            <a href="${checklistUrl}" style="color: #2563eb; word-break: break-all;">${checklistUrl}</a>
          </p>
        </div>
      </div>
    `;

		const {data, error} = await resend.emails.send({
			from: fromEmail,
			to: link.guardianEmail,
			subject: `Guardian Checklist for ${resident.name}`,
			html: emailHtml,
		});

		if (error) {
			console.error('❌ Resend API error:', error);
			return {
				success: false,
				error: `Failed to send email: ${error.message || 'Unknown error'}`,
			};
		}

		console.log('✅ Guardian checklist email sent successfully:', data?.id);
		return {success: true, messageId: data?.id};
	} catch (error) {
		console.error('❌ Exception while sending guardian checklist email:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}
