import {NextRequest, NextResponse} from 'next/server';
import {internalListAllActiveAlerts, internalListAdmins} from '@/db/queries/compliance';
import {Resend} from 'resend';

// This route is intended to be called by an internal scheduler (e.g., cron job)
// and does not require direct user authentication.
export async function POST(req: NextRequest) {
	// TODO: Implement a secure way to authenticate internal calls (e.g., API key)
	// For now, it's open, but in production, this needs to be secured.
	console.log('Triggered internal compliance alert email sending.');

	try {
		const alerts = await internalListAllActiveAlerts();
		const admins = await internalListAdmins();

		const apiKey = process.env.RESEND_API_KEY;
		if (!apiKey) {
			throw new Error('No Resend API key configured');
		}
		const resend = new Resend(apiKey);
		const fromEmail = process.env.FROM_EMAIL || 'Compliance System <noreply@compliance.example.com>';
		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com';

		for (const alert of alerts) {
			for (const admin of admins) {
				if (!admin || typeof admin.workEmail !== 'string') continue;
				await resend.emails.send({
					from: fromEmail,
					to: admin.workEmail,
					subject: `Compliance Alert: ${alert.type.toUpperCase()} due soon`,
					html: `<p>A compliance item (${alert.type}) is due soon for location: ${alert.location}.</p>
          <p><a href="${baseUrl}/?view=compliance">View details in the compliance dashboard (secure login required)</a></p>`,
				});
			}
		}
		return NextResponse.json({success: true}, {status: 200});
	} catch (error: any) {
		console.error('Error sending compliance alert emails:', error);
		return new NextResponse(error.message, {status: 500});
	}
}
