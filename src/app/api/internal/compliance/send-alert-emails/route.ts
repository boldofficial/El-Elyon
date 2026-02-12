import {NextRequest, NextResponse} from 'next/server';
import {internalListAllActiveAlerts, internalListAdmins} from '@/db/queries/compliance';
import {Resend} from 'resend';

// This route is intended to be called by an internal scheduler (e.g., cron job)
// and does not require direct user authentication.
export async function POST(req: NextRequest) {
	// Verify internal API key
	const apiKey = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace('Bearer ', '');
	const expectedKey = process.env.INTERNAL_API_KEY;

	if (!expectedKey) {
		return NextResponse.json(
			{error: 'Internal API not configured'},
			{status: 500}
		);
	}

	if (apiKey !== expectedKey) {
		console.log('🚨 Unauthorized internal API call to send-alert-emails');
		return NextResponse.json(
			{error: 'Unauthorized'},
			{status: 401}
		);
	}

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
		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

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
