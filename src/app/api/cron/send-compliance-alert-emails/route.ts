// src/app/api/cron/send-compliance-alert-emails/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {complianceAlerts, roles, employees} from '@/db/schema';
import {eq, inArray} from 'drizzle-orm';
import {Resend} from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail =
	process.env.FROM_EMAIL ||
	'Compliance System <noreply@compliance.example.com>';
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

export async function GET(req: NextRequest) {
	try {
		// Verify Vercel Cron Secret
		const authHeader = req.headers.get('authorization');
		if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		console.log('📧 Sending compliance alert emails...');

		// Get all active alerts
		const alerts = await db.query.complianceAlerts.findMany({
			where: eq(complianceAlerts.active, true),
		});

		if (alerts.length === 0) {
			console.log('No active alerts to send');
			return NextResponse.json({success: true, sent: 0});
		}

		// Get all admins
		const adminRoles = await db.query.roles.findMany({
			where: eq(roles.role, 'admin'),
		});

		const adminClerkUserIds = adminRoles
			.map((r) => r.clerkUserId)
			.filter((id): id is string => id !== null);

		if (adminClerkUserIds.length === 0) {
			console.log('No admins found to send emails to');
			return NextResponse.json({success: true, sent: 0});
		}

		const admins = await db.query.employees.findMany({
			where: inArray(employees.clerkUserId, adminClerkUserIds),
		});

		let sentCount = 0;

		for (const alert of alerts) {
			for (const admin of admins) {
				if (!admin.workEmail) continue;

				try {
					const emailHtml = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #dc2626; color: white; padding: 20px; text-align: center;">
                <h1>⚠️ Compliance Alert</h1>
              </div>
              <div style="padding: 30px; background: #f9fafb;">
                <h2>${alert.title}</h2>
                <p>${alert.description}</p>
                <p><strong>Location:</strong> ${alert.location}</p>
                <p><strong>Type:</strong> ${alert.type.toUpperCase()}</p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${baseUrl}/?view=compliance" 
                     style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                    View Compliance Dashboard
                  </a>
                </div>
                <p style="color: #666; font-size: 14px; margin-top: 30px;">
                  Please log in to view full details and take action.
                </p>
              </div>
            </div>
          `;

					await resend.emails.send({
						from: fromEmail,
						to: admin.workEmail,
						subject: `Compliance Alert: ${alert.type.toUpperCase()} - ${alert.location}`,
						html: emailHtml,
					});

					sentCount++;
				} catch (emailError) {
					console.error(`Failed to send to ${admin.workEmail}:`, emailError);
				}
			}
		}

		console.log(`✅ Sent ${sentCount} compliance alert emails`);
		return NextResponse.json({success: true, sent: sentCount});
	} catch (error: any) {
		console.error('❌ Error sending compliance alert emails:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
