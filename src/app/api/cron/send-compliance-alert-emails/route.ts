// src/app/api/cron/send-compliance-alert-emails/route.ts

import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {complianceAlerts, roles, employees} from '@/db/schema';
import {inArray} from 'drizzle-orm';
import {getUserRoleDoc} from '@/lib/db-helpers';
import {sendComplianceAlertEmail} from '@/lib/emails/compliance';

/**
 * CRON JOB: Sends weekly email notifications for active compliance alerts.
 * Runs: Every Monday at 10 AM (0 10 * * 1) - 1 hour after alert generation.
 *
 * Recipients: admins AND supervisors.
 *   - Admins receive every deadline alert.
 *   - Supervisors receive only alerts for their assigned locations.
 * Only ISP and Fire Evac deadline alerts are emailed; smoke-detector and
 * fire-drill reminders are surfaced in-app to all users, not emailed.
 *
 * Security: Uses Vercel Cron Secret from Authorization header.
 */

const EMAILED_TYPES = ['isp', 'fire_evac'];

export async function GET(req: NextRequest) {
	try {
		const authHeader = req.headers.get('authorization');
		const cronSecret = process.env.CRON_SECRET;

		if (!cronSecret) {
			console.error('❌ CRON_SECRET not configured');
			return NextResponse.json({error: 'Server misconfiguration'}, {status: 500});
		}
		if (authHeader !== `Bearer ${cronSecret}`) {
			console.error('❌ Unauthorized cron attempt');
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		console.log('📧 Starting compliance alert email sending...');

		const activeAlerts = (
			await db.query.complianceAlerts.findMany({
				where: (a, {eq}) => eq(a.active, true),
			})
		).filter((a) => EMAILED_TYPES.includes(a.type));

		if (activeAlerts.length === 0) {
			console.log('✅ No active deadline alerts to send');
			return NextResponse.json({success: true, sent: 0, message: 'No active alerts'});
		}

		// Recipients: all admins + supervisors.
		const recipientRoles = await db.query.roles.findMany({
			where: (r, {inArray: inArr}) => inArr(r.role, ['admin', 'supervisor']),
		});
		const recipientIds = recipientRoles
			.map((r) => r.clerkUserId)
			.filter((id): id is string => !!id);

		if (recipientIds.length === 0) {
			return NextResponse.json({success: true, sent: 0, message: 'No recipients'});
		}

		const recipientEmployees = await db.query.employees.findMany({
			where: inArray(employees.clerkUserId, recipientIds),
		});
		const employeeByClerkId = new Map(
			recipientEmployees.map((e) => [e.clerkUserId, e])
		);

		let sentCount = 0;
		const results: Array<{email: string; success: boolean; error?: any}> = [];

		for (const clerkUserId of recipientIds) {
			const employee = employeeByClerkId.get(clerkUserId);
			if (!employee?.workEmail) continue;

			// Merged role + locations (roles + employee locations).
			const roleDoc = await getUserRoleDoc(clerkUserId);
			const isAdmin = roleDoc?.role?.toLowerCase() === 'admin';
			const locations = roleDoc?.locations || [];

			// Scope alerts: admins get all; supervisors only their locations.
			const visible = isAdmin
				? activeAlerts
				: activeAlerts.filter((a) => locations.includes(a.location));
			if (visible.length === 0) continue;

			const alertsByLocation: Record<string, typeof activeAlerts> = {};
			for (const alert of visible) {
				(alertsByLocation[alert.location] ||= []).push(alert);
			}

			try {
				const result = await sendComplianceAlertEmail({
					to: employee.workEmail,
					adminName: employee.name,
					alertsByLocation,
					totalAlerts: visible.length,
				});
				if (result.success) {
					sentCount++;
					results.push({email: employee.workEmail, success: true});
				} else {
					results.push({
						email: employee.workEmail,
						success: false,
						error: result.error,
					});
				}
			} catch (emailError) {
				results.push({
					email: employee.workEmail,
					success: false,
					error: emailError,
				});
			}
		}

		console.log(`✅ Email sending completed: ${sentCount} sent`);
		return NextResponse.json({success: true, sent: sentCount, results});
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
