import {Resend} from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const fromEmail =
	process.env.FROM_EMAIL ||
	'Compliance System <noreply@compliance.example.com>';
const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

/**
 * Sends email notifications for active compliance alerts
 */
export async function sendComplianceAlertEmail(args: {
	to: string;
	adminName: string;
	alertsByLocation: Record<string, any[]>;
	totalAlerts: number;
}) {
	try {
		console.log('📧 Sending compliance alert email to:', args.to);

		if (!process.env.RESEND_API_KEY) {
			console.error('❌ RESEND_API_KEY not configured');
			return {success: false, error: 'Email service not configured'};
		}

		const emailHtml = generateEmailHTML(
			args.adminName,
			args.alertsByLocation,
			baseUrl,
			args.totalAlerts
		);

		const {data, error} = await resend.emails.send({
			from: fromEmail,
			to: args.to,
			subject: `🚨 Compliance Alerts: ${args.totalAlerts} Item(s) Require Attention`,
			html: emailHtml,
		});

		if (error) {
			console.error('❌ Resend API error:', error);
			return {
				success: false,
				error: `Failed to send email: ${error.message || 'Unknown error'}`,
			};
		}

		console.log('✅ Compliance alert email sent successfully:', data?.id);
		return {success: true, emailId: data?.id};
	} catch (error) {
		console.error('❌ Exception while sending compliance alert email:', error);
		return {
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error occurred',
		};
	}
}

/**
 * Generate HTML email content for compliance alerts
 */
function generateEmailHTML(
	adminName: string,
	alertsByLocation: Record<string, any[]>,
	baseUrl: string,
	totalAlerts: number
): string {
	const locations = Object.keys(alertsByLocation);

	let locationSections = '';
	for (const location of locations) {
		const alerts = alertsByLocation[location];
		const ispAlerts = alerts.filter((a) => a.type === 'isp');
		const fireEvacAlerts = alerts.filter((a) => a.type === 'fire_evac');

		locationSections += `
			<div style="background: white; border: 2px solid #e5e7eb; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
				<h3 style="color: #1f2937; margin-top: 0; font-size: 18px;">
					📍 ${location}
				</h3>
				
				${
					ispAlerts.length > 0
						? `
					<div style="margin: 15px 0;">
						<h4 style="color: #dc2626; margin-bottom: 10px; font-size: 16px;">
							📋 ISP Alerts (${ispAlerts.length})
						</h4>
						<ul style="color: #374151; line-height: 1.8; margin: 0; padding-left: 20px;">
							${ispAlerts
								.map(
									(alert) => `
								<li>
									<strong>${alert.title}</strong>
									<br>
									<span style="font-size: 14px; color: #6b7280;">${alert.description}</span>
								</li>
							`
								)
								.join('')}
						</ul>
					</div>
				`
						: ''
				}
				
				${
					fireEvacAlerts.length > 0
						? `
					<div style="margin: 15px 0;">
						<h4 style="color: #f59e0b; margin-bottom: 10px; font-size: 16px;">
							🔥 Fire Evac Alerts (${fireEvacAlerts.length})
						</h4>
						<ul style="color: #374151; line-height: 1.8; margin: 0; padding-left: 20px;">
							${fireEvacAlerts
								.map(
									(alert) => `
								<li>
									<strong>${alert.title}</strong>
									<br>
									<span style="font-size: 14px; color: #6b7280;">${alert.description}</span>
								</li>
							`
								)
								.join('')}
						</ul>
					</div>
				`
						: ''
				}
			</div>
		`;
	}

	return `
		<!DOCTYPE html>
		<html>
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
		</head>
		<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
			<div style="max-width: 600px; margin: 0 auto; padding: 20px;">
				<!-- Header -->
				<div style="background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
					<h1 style="margin: 0; font-size: 28px;">⚠️ Compliance Alerts</h1>
					<p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
						Weekly Compliance Summary
					</p>
				</div>
				
				<!-- Content -->
				<div style="background: #f9fafb; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e5e7eb; border-top: none;">
					<p style="color: #374151; font-size: 16px; line-height: 1.6; margin-top: 0;">
						Hello ${adminName || 'Admin'},
					</p>
					
					<p style="color: #374151; font-size: 16px; line-height: 1.6;">
						You have <strong>${totalAlerts} active compliance alert${totalAlerts !== 1 ? 's' : ''}</strong> 
						across ${locations.length} location${locations.length !== 1 ? 's' : ''} that require attention.
					</p>
					
					<!-- Locations -->
					${locationSections}
					
					<!-- CTA Button -->
					<div style="text-align: center; margin: 30px 0;">
						<a href="${baseUrl}/?view=compliance" 
							 style="background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; font-size: 16px;">
							View Compliance Dashboard
						</a>
					</div>
					
					<!-- Important Notice -->
					<div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0; border-radius: 4px;">
						<p style="margin: 0; color: #92400e; font-size: 14px;">
							<strong>⏰ Action Required:</strong> Please review these items in the compliance dashboard 
							and take necessary actions to ensure all requirements are met.
						</p>
					</div>
					
					<!-- Footer -->
					<p style="color: #6b7280; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
						This is an automated message from your Compliance Management System.
						<br>
						You received this email because you are an administrator.
					</p>
				</div>
			</div>
		</body>
		</html>
	`;
}
