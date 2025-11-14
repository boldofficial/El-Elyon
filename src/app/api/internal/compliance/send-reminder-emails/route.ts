import {NextRequest, NextResponse} from 'next/server';
import {Resend} from 'resend';
import {getUserRoleDoc} from '@/lib/db-helpers';
import {internalListAdmins, getComplianceOverview} from '@/db/queries/compliance';
import {db} from '@/db/index'; // Corrected import path
import {employees} from '@/db/schema'; // Corrected import path
import {eq, inArray} from 'drizzle-orm';

// Internal action to send compliance reminder emails
export async function POST(req: NextRequest) {
	// TODO: Implement a secure way to authenticate internal calls (e.g., API key)
	console.log('Triggered internal compliance reminder email sending.');

	try {
		const {itemIds, clerkUserId} = await req.json();

		if (!itemIds || !Array.isArray(itemIds) || !clerkUserId) {
			return new NextResponse('itemIds (array of strings) and clerkUserId are required', {status: 400});
		}

		const apiKey = process.env.RESEND_API_KEY;
		if (!apiKey) {
			throw new Error('No Resend API key configured');
		}
		const resend = new Resend(apiKey);

		const employee = await db.query.employees.findFirst({
			where: eq(employees.clerkUserId, clerkUserId),
		});

		if (!employee || !employee.workEmail) {
			throw new Error('Employee not found or work email missing');
		}

		const recipients = await internalListAdmins(); // Assuming admins receive these reminders

		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com';

		// Filter compliance items based on itemIds
		const allComplianceItems = await getComplianceOverview(clerkUserId); // This will get all items for the admin
		const items = allComplianceItems.filter(item => itemIds.includes(item.id));

		const overdueItems = items.filter((item: any) => item.status === 'overdue');
		const dueSoonItems = items.filter((item: any) => item.status === 'due-soon');

		const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 28px;">⚠️ Compliance Reminder</h1>
        </div>
        
        <div style="background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e9ecef;">
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            This is a reminder about compliance items that require your attention.
          </p>
          
          ${overdueItems.length > 0 ? `
            <div style="background: #fee2e2; border: 2px solid #dc2626; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #991b1b; margin-top: 0;">🚨 Overdue Items (${overdueItems.length})</h3>
              <ul style="color: #7f1d1d; line-height: 1.8;">
                ${overdueItems.map((item: any) => `
                  <li>
                    <strong>${item.type === 'isp' ? 'ISP' : 'Fire Evac'}</strong> - ${item.residentName} (${item.location})
                    <br>
                    <span style="font-size: 14px;">Due: ${new Date(item.dueDate).toLocaleDateString()}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
          
          ${dueSoonItems.length > 0 ? `
            <div style="background: #fef3c7; border: 2px solid #f59e0b; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #92400e; margin-top: 0;">⏰ Due Soon (${dueSoonItems.length})</h3>
              <ul style="color: #78350f; line-height: 1.8;">
                ${dueSoonItems.map((item: any) => `
                  <li>
                    <strong>${item.type === 'isp' ? 'ISP' : 'Fire Evac'}</strong> - ${item.residentName} (${item.location})
                    <br>
                    <span style="font-size: 14px;">Due: ${new Date(item.dueDate).toLocaleDateString()}</span>
                  </li>
                `).join('')}
              </ul>
            </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${baseUrl}/?view=compliance" 
               style="background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block; font-size: 16px;">
              View Compliance Dashboard
            </a>
          </div>
          
          <div style="background: #e0e7ff; border: 1px solid #818cf8; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p style="margin: 0; color: #3730a3; font-size: 14px;">
              <strong>📋 Action Required:</strong> Please review and update these compliance items as soon as possible.
            </p>
          </div>
          
          <p style="color: #555; font-size: 14px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #dee2e6;">
            This reminder was sent by ${employee.name || employee.workEmail} from the compliance management system.
          </p>
        </div>
      </div>
    `;

		const results: any[] = [];
		for (const recipient of recipients) {
			if (!recipient.workEmail) continue;

			try {
				const fromEmail = process.env.FROM_EMAIL || 'Compliance System <noreply@compliance.example.com>';
				const {data, error} = await resend.emails.send({
					from: fromEmail,
					to: recipient.workEmail,
					subject: `Compliance Reminder: ${overdueItems.length} Overdue, ${dueSoonItems.length} Due Soon`,
					html: emailHtml,
				});

				if (error) {
					console.error(`Failed to send to ${recipient.workEmail}:`, error);
					results.push({email: recipient.workEmail, success: false, error});
				} else {
					results.push({email: recipient.workEmail, success: true, messageId: data?.id});
				}
			} catch (error) {
				console.error(`Error sending to ${recipient.workEmail}:`, error);
				results.push({email: recipient.workEmail, success: false, error});
			}
		}

		return NextResponse.json({sent: results.filter(r => r.success).length, total: recipients.length, results}, {status: 200});
	} catch (error: any) {
		console.error('Error sending compliance reminder emails:', error);
		return new NextResponse(error.message, {status: 500});
	}
}
