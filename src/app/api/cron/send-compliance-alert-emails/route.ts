// src/app/api/cron/send-compliance-alert-emails/route.ts

import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {complianceAlerts, roles, employees} from '@/db/schema';
import {eq, inArray} from 'drizzle-orm';
import {Resend} from 'resend';

/**
 * CRON JOB: Sends email notifications for active compliance alerts
 * Runs: Every Monday at 10 AM (0 10 * * 1) - 1 hour after alert generation
 *
 * Security: Uses Vercel Cron Secret from Authorization header
 */
export async function GET(req: NextRequest) {
	try {
		// ✅ Verify Vercel Cron Secret
		const authHeader = req.headers.get('authorization');
		const cronSecret = process.env.CRON_SECRET;

		if (!cronSecret) {
			console.error('❌ CRON_SECRET not configured in environment variables');
			return NextResponse.json(
				{error: 'Server misconfiguration'},
				{status: 500}
			);
		}

		if (authHeader !== `Bearer ${cronSecret}`) {
			console.error('❌ Unauthorized cron attempt');
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		console.log('📧 Starting compliance alert email sending...');

		// ========================================
		// Validate Required Environment Variables
		// ========================================
		const resendApiKey = process.env.RESEND_API_KEY;
		if (!resendApiKey) {
			console.error('❌ RESEND_API_KEY not configured');
			return NextResponse.json(
				{error: 'Email service not configured'},
				{status: 500}
			);
		}

		const fromEmail =
			process.env.FROM_EMAIL ||
			'Compliance System <noreply@compliance.example.com>';
		const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3001';

		const resend = new Resend(resendApiKey);

		// ========================================
		// Get Active Alerts
		// ========================================
		const activeAlerts = await db.query.complianceAlerts.findMany({
			where: eq(complianceAlerts.active, true),
		});

		if (activeAlerts.length === 0) {
			console.log('✅ No active alerts to send');
			return NextResponse.json({
				success: true,
				sent: 0,
				message: 'No active alerts found',
			});
		}

		console.log(`📋 Found ${activeAlerts.length} active alerts`);

		// ========================================
		// Get Admin Recipients
		// ========================================
		const adminRoles = await db.query.roles.findMany({
			where: eq(roles.role, 'admin'),
		});

		const adminClerkUserIds = adminRoles
			.map((r) => r.clerkUserId)
			.filter((id): id is string => id !== null);

		if (adminClerkUserIds.length === 0) {
			console.log('⚠️ No admins found to send emails to');
			return NextResponse.json({
				success: true,
				sent: 0,
				message: 'No admin recipients found',
			});
		}

		const adminEmployees = await db.query.employees.findMany({
			where: inArray(employees.clerkUserId, adminClerkUserIds),
		});

		const validAdmins = adminEmployees.filter((emp) => emp.workEmail);
		console.log(`👥 Found ${validAdmins.length} admin recipients`);

		// ========================================
		// Group Alerts by Location for Better Email
		// ========================================
		const alertsByLocation: Record<string, typeof activeAlerts> = {};
		for (const alert of activeAlerts) {
			if (!alertsByLocation[alert.location]) {
				alertsByLocation[alert.location] = [];
			}
			alertsByLocation[alert.location].push(alert);
		}

		// ========================================
		// Send Emails
		// ========================================
		let sentCount = 0;
		const emailResults: Array<{email: string; success: boolean; error?: any}> =
			[];

		for (const admin of validAdmins) {
			if (!admin.workEmail) continue;

			try {
				// Generate email HTML
				const emailHtml = generateEmailHTML(
					admin.name,
					alertsByLocation,
					baseUrl
				);

				const {data, error} = await resend.emails.send({
					from: fromEmail,
					to: admin.workEmail,
					subject: `🚨 Compliance Alerts: ${activeAlerts.length} Item(s) Require Attention`,
					html: emailHtml,
				});

				if (error) {
					console.error(`❌ Failed to send to ${admin.workEmail}:`, error);
					emailResults.push({
						email: admin.workEmail,
						success: false,
						error,
					});
				} else {
					console.log(`✅ Sent email to ${admin.workEmail}`);
					sentCount++;
					emailResults.push({
						email: admin.workEmail,
						success: true,
					});
				}
			} catch (emailError) {
				console.error(
					`❌ Exception sending to ${admin.workEmail}:`,
					emailError
				);
				emailResults.push({
					email: admin.workEmail,
					success: false,
					error: emailError,
				});
			}
		}

		console.log(
			`✅ Email sending completed: ${sentCount}/${validAdmins.length} successful`
		);

		return NextResponse.json({
			success: true,
			sent: sentCount,
			total: validAdmins.length,
			results: emailResults,
		});
	} catch (error: any) {
		console.error('❌ Fatal error in compliance alert email sending:', error);
		return NextResponse.json(
			{
				error: error.message,
				stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
			},
			{status: 500}
		);
	}
}

/**
 * Generate HTML email content
 */
function generateEmailHTML(
	adminName: string,
	alertsByLocation: Record<string, any[]>,
	baseUrl: string
): string {
	const locations = Object.keys(alertsByLocation);
	const totalAlerts = Object.values(alertsByLocation).flat().length;

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
