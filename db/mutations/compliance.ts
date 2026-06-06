// src/db/mutations/compliance.ts

import {db} from '../index';
import {
	complianceAlerts,
	isp,
	fireEvac,
	guardianChecklistLinks,
	config,
	employees,
	roles,
} from '../schema';
import {eq, inArray} from 'drizzle-orm';
import {requireAdminOrPrivilege} from '@/lib/db-helpers';
import {logAudit} from './audit';
import {sendComplianceAlertEmail} from '@/lib/emails/compliance';
import {sendGuardianChecklistEmail} from '@/lib/emails/guardian';
import {getComplianceOverview} from '@/db/queries/compliance';

// ========================================
// Internal Alert Creation
// ========================================

export async function internalCreateAlert(
	type: 'isp' | 'fire_evac',
	location: string,
	dueAt: number,
	details?: string
) {
	await db.insert(complianceAlerts).values({
		type,
		title: `${type} alert`,
		description: details || `${type} alert for ${location} due soon`,
		location,
		status: 'active',
		severity: 'medium',
		active: true,
		createdAt: new Date(),
		// metadata: {
		// 	dueDate: dueAt,
		// },
	});
	return true;
}

// ========================================
// Send Compliance Reminders
// ========================================

export async function sendComplianceReminders(
	clerkUserId: string,
	itemIds: string[]
) {
	if (!clerkUserId) {
		throw new Error('Not authenticated');
	}

	await requireAdminOrPrivilege(clerkUserId, 'manage_compliance');

	// Get the admin sending the reminder
	const sendingAdmin = await db.query.employees.findFirst({
		where: eq(employees.clerkUserId, clerkUserId),
	});

	if (!sendingAdmin) {
		throw new Error('Admin employee record not found');
	}

	// Get all admin and supervisor recipients
	const recipientRoles = await db.query.roles.findMany({
		where: inArray(roles.role, ['admin', 'supervisor']),
	});

	const recipientClerkUserIds = recipientRoles
		.map((r) => r.clerkUserId)
		.filter((id): id is string => id !== null);

	if (recipientClerkUserIds.length === 0) {
		throw new Error('No admin/supervisor recipients found');
	}

	const recipients = await db.query.employees.findMany({
		where: inArray(employees.clerkUserId, recipientClerkUserIds),
	});

	const validRecipients = recipients.filter((emp) => emp.workEmail);

	// Get compliance items
	const allItems = await getComplianceOverview(clerkUserId);
	const selectedItems = allItems.filter((item) => itemIds.includes(item.id));

	if (selectedItems.length === 0) {
		throw new Error('No valid compliance items found');
	}

	// Group alerts by location
	const alertsByLocation: Record<string, any[]> = {};
	for (const item of selectedItems) {
		if (!alertsByLocation[item.location]) {
			alertsByLocation[item.location] = [];
		}
		alertsByLocation[item.location].push(item);
	}

	// Send emails
	let sentCount = 0;
	for (const recipient of validRecipients) {
		if (!recipient.workEmail) continue;

		try {
			const result = await sendComplianceAlertEmail({
				to: recipient.workEmail,
				adminName: recipient.name,
				alertsByLocation,
				totalAlerts: selectedItems.length,
			});

			if (result.success) {
				sentCount++;
			}
		} catch (error) {
			console.error(`Failed to send to ${recipient.workEmail}:`, error);
		}
	}

	await logAudit({
		clerkUserId,
		event: 'send_compliance_reminders',
		details: `Sent ${sentCount} emails for ${itemIds.length} items`,
		deviceId: 'system',
		location: '',
	});

	return {sent: sentCount, total: validRecipients.length};
}

// ========================================
// Export Compliance List
// ========================================

export async function exportComplianceList(
	clerkUserId: string,
	itemIds: string[]
) {
	if (!clerkUserId) {
		throw new Error('Not authenticated');
	}
	await requireAdminOrPrivilege(clerkUserId, 'manage_compliance');

	// Get compliance items
	const allItems = await getComplianceOverview(clerkUserId);
	const selectedItems = allItems.filter((item) => itemIds.includes(item.id));

	if (selectedItems.length === 0) {
		throw new Error('No valid compliance items found');
	}

	// Generate CSV data
	const csvHeader = 'Type,Resident,Location,Status,Due Date,Description\n';
	const csvRows = selectedItems
		.map(
			(item: any) =>
				`"${item.type}","${item.residentName}","${item.location}","${item.status}","${new Date(item.dueDate).toLocaleDateString()}","${item.description}"`
		)
		.join('\n');

	const csvData = csvHeader + csvRows;

	await logAudit({
		clerkUserId,
		event: 'export_compliance_list',
		details: `Exported ${itemIds.length} items`,
		deviceId: 'system',
		location: '',
	});

	return {
		exported: itemIds.length,
		csvData,
		filename: `compliance-export-${new Date().toISOString().split('T')[0]}.csv`,
	};
}

// ========================================
// Resend Guardian Checklist Link
// ========================================

export async function resendGuardianLink(clerkUserId: string, linkId: string) {
	if (!clerkUserId) {
		throw new Error('Not authenticated');
	}
	await requireAdminOrPrivilege(clerkUserId, 'manage_compliance');

	const link = await db.query.guardianChecklistLinks.findFirst({
		where: eq(guardianChecklistLinks.id, linkId),
	});

	if (!link) {
		throw new Error('Link not found');
	}

	// Extend expiration by 30 days
	const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
	await db
		.update(guardianChecklistLinks)
		.set({expiresAt: newExpiresAt})
		.where(eq(guardianChecklistLinks.id, linkId));

	// Send email
	try {
		await sendGuardianChecklistEmail(linkId, link.token);
	} catch (error) {
		console.error('Error sending guardian checklist email:', error);
		throw new Error('Failed to send checklist email');
	}

	await logAudit({
		clerkUserId,
		event: 'resend_guardian_link',
		details: `Resent link ${linkId} to ${link.guardianEmail}`,
		deviceId: 'system',
		location: '',
	});

	return {linkId, token: link.token, sent: true};
}

// ========================================
// ISP Due Date Management
// ========================================

export async function setIspDueDate(residentId: string, ispId: string) {
	const dueAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30 * 6); // 6 months
	await db.update(isp).set({dueAt}).where(eq(isp.id, ispId));

	await logAudit({
		clerkUserId: null,
		event: 'set_isp_due_date',
		details: `ispId=${ispId} dueAt=${dueAt.toISOString()} residentId=${residentId}`,
		deviceId: 'system',
		location: '',
	});
	return true;
}

// ========================================
// Alert Schedule Management
// ========================================

export async function setAlertSchedule(
	clerkUserId: string,
	weekday: number,
	hour: number,
	minute: number
) {
	await requireAdminOrPrivilege(clerkUserId, 'manage_compliance');

	const configRecord = await db.query.config.findFirst();

	if (configRecord) {
		await db
			.update(config)
			.set({
				alertWeekday: weekday,
				alertHour: hour,
				alertMinute: minute,
			})
			.where(eq(config.id, configRecord.id));
	} else {
		await db.insert(config).values({
			alertWeekday: weekday,
			alertHour: hour,
			alertMinute: minute,
		});
	}

	await logAudit({
		clerkUserId,
		event: 'set_alert_schedule',
		details: `weekday=${weekday},hour=${hour},minute=${minute}`,
		deviceId: 'system',
		location: '',
	});
	return true;
}

// ========================================
// Dismiss Alert
// ========================================

export async function dismissAlert(clerkUserId: string, alertId: string) {
	await requireAdminOrPrivilege(clerkUserId, 'manage_compliance');

	const alert = await db.query.complianceAlerts.findFirst({
		where: eq(complianceAlerts.id, alertId),
	});

	if (!alert || !alert.active) {
		throw new Error('Alert not found or not active');
	}

	await db
		.update(complianceAlerts)
		.set({
			active: false,
			dismissedBy: clerkUserId,
			dismissedAt: new Date(),
		})
		.where(eq(complianceAlerts.id, alertId));

	await logAudit({
		clerkUserId,
		event: 'dismiss_alert',
		details: `alertId=${alertId},type=${alert.type},location=${alert.location}`,
		deviceId: 'system',
		location: '',
	});
	return true;
}
