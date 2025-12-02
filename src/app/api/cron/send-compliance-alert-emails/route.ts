// src/app/api/cron/send-compliance-alert-emails/route.ts

import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {complianceAlerts, roles, employees} from '@/db/schema';
import {eq, inArray} from 'drizzle-orm';
import {sendComplianceAlertEmail} from '@/lib/emails/compliance';

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

		const alertsByLocation: Record<string, typeof activeAlerts> = {};
		for (const alert of activeAlerts) {
			if (!alertsByLocation[alert.location]) {
				alertsByLocation[alert.location] = [];
			}
			alertsByLocation[alert.location].push(alert);
		}

		let sentCount = 0;
		const emailResults: Array<{email: string; success: boolean; error?: any}> =
			[];
		const totalAlerts = Object.values(alertsByLocation).flat().length;

		for (const admin of validAdmins) {
			if (!admin.workEmail) continue;

			try {
				const result = await sendComplianceAlertEmail({
					to: admin.workEmail,
					adminName: admin.name,
					alertsByLocation: alertsByLocation,
					totalAlerts: totalAlerts,
				});

				if (result.success) {
					console.log(`✅ Sent email to ${admin.workEmail}`);
					sentCount++;
					emailResults.push({
						email: admin.workEmail,
						success: true,
					});
				} else {
					console.error(
						`❌ Failed to send to ${admin.workEmail}:`,
						result.error
					);
					emailResults.push({
						email: admin.workEmail,
						success: false,
						error: result.error,
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
