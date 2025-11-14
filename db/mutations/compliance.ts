import {db} from '../index';
import {complianceAlerts, isp, fireEvac, guardianChecklistLinks, config} from '../schema';
import {eq, and, desc} from 'drizzle-orm';
import {requireAdminAccess, getUserRoleDoc} from '@/lib/db-helpers';
import {logAudit} from './audit';

// Internal: Create alert
export async function internalCreateAlert(
	type: 'isp' | 'fire_evac',
	location: string,
	dueAt: number,
	details?: string
) {
	await db.insert(complianceAlerts).values({
		type,
		title: `${type} alert`,
		description: details || `${type} alert for ${location} due soon`, // Adjusted description
		location,
		status: 'active',
		severity: 'medium',
		active: true,
		createdAt: new Date(),
	});
	return true;
}

// --- NEW: Send compliance reminders ---
export async function sendComplianceReminders(clerkUserId: string, itemIds: string[]) {
	if (!clerkUserId) {
		throw new Error('Not authenticated');
	}

	await logAudit({
		clerkUserId: clerkUserId as string, // Explicitly cast to string
		event: 'send_compliance_reminders',
		details: `itemCount=${itemIds.length}`,
		deviceId: 'system',
		location: '',
	});

	// In a real Next.js app, this would trigger an external email service
	// or a background job to send emails. For now, we'll just log it.
	console.log(`Scheduled compliance reminder emails for ${itemIds.length} items by ${clerkUserId}`);

	// You would typically call an internal API route or a job queue here
	// For example:
	// await fetch('/api/internal/send-compliance-reminders', {
	//   method: 'POST',
	//   body: JSON.stringify({ itemIds, clerkUserId }),
	// });

	return {sent: itemIds.length};
}

// --- NEW: Export compliance list ---
export async function exportComplianceList(clerkUserId: string, itemIds: string[]) {
	if (!clerkUserId) {
		throw new Error('Not authenticated');
	}
	await requireAdminAccess(clerkUserId);

	await logAudit({
		clerkUserId,
		event: 'export_compliance_list',
		details: `itemCount=${itemIds.length}`,
		deviceId: 'system',
		location: '',
	});

	// In a real Next.js app, this would trigger a process to generate and
	// export the compliance list, possibly to a file storage service or email.
	console.log(`Exported compliance list for ${itemIds.length} items by ${clerkUserId}`);

	return {exported: itemIds.length};
}

// --- NEW: Resend guardian checklist link ---
export async function resendGuardianLink(clerkUserId: string, linkId: string) {
	if (!clerkUserId) {
		throw new Error('Not authenticated');
	}
	// Assuming only admins or authorized staff can resend links
	await requireAdminAccess(clerkUserId); // Or a more granular check

	const link = await db.query.guardianChecklistLinks.findFirst({
		where: eq(guardianChecklistLinks.id, linkId),
	});

	if (!link) throw new Error('Link not found');

	const newExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days from now
	await db.update(guardianChecklistLinks).set({expiresAt: newExpiresAt}).where(eq(guardianChecklistLinks.id, linkId));

	await logAudit({
		clerkUserId,
		event: 'resend_guardian_link',
		details: `linkId=${linkId}`,
		deviceId: 'system',
		location: '',
	});

	// In a real Next.js app, this would trigger an external email service
	// or a background job to send emails. For now, we'll just log it.
	console.log(`Resent guardian checklist link ${linkId} to ${link.guardianEmail}`);

	// You would typically call an internal API route or a job queue here
	// For example:
	// await fetch('/api/internal/send-guardian-checklist-email', {
	//   method: 'POST',
	//   body: JSON.stringify({ linkId, token: link.token }),
	// });

	return {linkId, token: link.token};
}

// Mutation: When ISP is published, set due +6mo (called from existing publishIsp)
export async function setIspDueDate(residentId: string, ispId: string) {
	const dueAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30 * 6); // 6 months from now
	await db.update(isp).set({dueAt}).where(eq(isp.id, ispId));

	await logAudit({
		clerkUserId: null, // This mutation is called internally, so no direct clerkUserId
		event: 'set_isp_due_date',
		details: `ispId=${ispId} dueAt=${dueAt.toISOString()} residentId=${residentId}`,
		deviceId: 'system',
		location: '',
	});
	return true;
}

// Mutation: Generate upload URL for fire evac plan
export async function generateFireEvacUploadUrl(clerkUserId: string | null) {
	if (!clerkUserId) {
		throw new Error('Not authenticated');
	}
	// Check if user has admin or supervisor access
	const userRole = await getUserRoleDoc(clerkUserId);
	if (!userRole || (!['admin', 'supervisor'].includes(userRole.role as string))) {
		throw new Error(
			'Forbidden: Only admins and supervisors can upload fire evacuation plans'
		);
	}

	// In a real Next.js app, this would interact with a file storage service
	// like AWS S3, Vercel Blob, or a custom backend.
	// For now, return a a placeholder URL.
	console.log('Placeholder: Generating fire evac plan upload URL');
	return {
		url: 'https://placeholder.com/upload-fire-evac-plan',
		// You might also return a unique ID for the file, and other metadata
		// that your frontend needs to upload the file.
	};
}

// Mutation: Admin sets alert schedule
export async function setAlertSchedule(clerkUserId: string, weekday: number, hour: number, minute: number) {
	await requireAdminAccess(clerkUserId);

	const configRecord = await db.query.config.findFirst();

	if (configRecord) {
		await db.update(config).set({
			alertWeekday: weekday,
			alertHour: hour,
			alertMinute: minute,
		}).where(eq(config.id, configRecord.id));
	} else {
		// If no config exists, create one (assuming a single config record)
		await db.insert(config).values({
			id: 'default-config', // Or generate a UUID
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

// Mutation: Dismiss alert
export async function dismissAlert(clerkUserId: string, alertId: string) {
	await requireAdminAccess(clerkUserId); // Assuming only admins can dismiss alerts

	const alert = await db.query.complianceAlerts.findFirst({
		where: eq(complianceAlerts.id, alertId),
	});

	if (!alert || !alert.active) throw new Error('Alert not found or not active');

	await db.update(complianceAlerts).set({
		active: false,
		dismissedBy: clerkUserId,
		dismissedAt: new Date(),
	}).where(eq(complianceAlerts.id, alertId));

	await logAudit({
		clerkUserId,
		event: 'dismiss_alert',
		details: `alertId=${alertId},type=${alert.type},location=${alert.location}`,
		deviceId: 'system',
		location: '',
	});
	return true;
}
