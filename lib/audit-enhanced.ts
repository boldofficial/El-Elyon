/**
 * Enhanced Audit Logging Utilities
 * Provides comprehensive audit trail with request context
 */

import {db} from '@/db/index';
import {auditLogs} from '@/db/schema';
import {InferInsertModel} from 'drizzle-orm';
import {NextRequest} from 'next/server';

type NewAuditLog = InferInsertModel<typeof auditLogs>;

// Allow clerkUserId to be null for internal actions
type LogAuditParams = Omit<NewAuditLog, 'id' | 'timestamp'> & {
	clerkUserId: string | null;
};

/**
 * Basic audit log function (backward compatible)
 */
export async function logAudit(log: LogAuditParams) {
	await db.insert(auditLogs).values({
		...log,
		timestamp: new Date(),
	});
}

/**
 * Enhanced audit log with request context
 * Automatically extracts IP, user agent, and other metadata
 */
export async function logAuditWithContext(params: {
	clerkUserId: string | null;
	event: string;
	details: string;
	location: string;
	req?: NextRequest;
	deviceId?: string;
	metadata?: Record<string, any>;
}) {
	const {clerkUserId, event, details, location, req, deviceId, metadata} = params;

	// Extract request context if available
	let requestContext = '';
	if (req) {
		const ip = req.headers.get('x-forwarded-for') || 'unknown';
		const userAgent = req.headers.get('user-agent') || 'unknown';
		const method = req.method;
		const path = req.nextUrl.pathname;

		requestContext = `ip=${ip},ua=${userAgent.substring(0, 50)},method=${method},path=${path}`;
	}

	// Combine details with request context and metadata
	const fullDetails = [
		details,
		requestContext,
		metadata ? `metadata=${JSON.stringify(metadata)}` : '',
	]
		.filter(Boolean)
		.join(',');

	await db.insert(auditLogs).values({
		clerkUserId,
		event,
		details: fullDetails,
		deviceId: deviceId || (req ? 'web' : 'system'),
		location,
		timestamp: new Date(),
	});
}

/**
 * Log critical security events
 * These events should trigger alerts
 */
export async function logSecurityEvent(params: {
	clerkUserId: string | null;
	event: string;
	severity: 'low' | 'medium' | 'high' | 'critical';
	details: string;
	location: string;
	req?: NextRequest;
}) {
	const {clerkUserId, event, severity, details, location, req} = params;

	await logAuditWithContext({
		clerkUserId,
		event: `SECURITY_${severity.toUpperCase()}_${event}`,
		details,
		location,
		req,
		metadata: {
			severity,
			timestamp: new Date().toISOString(),
		},
	});

	// In production, you might want to send alerts for high/critical events
	if (process.env.NODE_ENV === 'production' && ['high', 'critical'].includes(severity)) {
		console.error(`[SECURITY ALERT] ${severity.toUpperCase()}: ${event}`, details);
		// TODO: Send to alerting service (PagerDuty, Slack, etc.)
	}
}

/**
 * Log data access events (for compliance)
 */
export async function logDataAccess(params: {
	clerkUserId: string;
	resourceType: string;
	resourceId: string;
	action: 'view' | 'create' | 'update' | 'delete';
	location: string;
	req?: NextRequest;
}) {
	const {clerkUserId, resourceType, resourceId, action, location, req} = params;

	await logAuditWithContext({
		clerkUserId,
		event: `DATA_ACCESS_${action.toUpperCase()}`,
		details: `resource=${resourceType},id=${resourceId}`,
		location,
		req,
		metadata: {
			resourceType,
			resourceId,
			action,
		},
	});
}

/**
 * Log authentication events
 */
export async function logAuthEvent(params: {
	clerkUserId: string | null;
	event: 'login' | 'logout' | 'login_failed' | 'session_expired' | 'password_reset';
	details?: string;
	req?: NextRequest;
}) {
	const {clerkUserId, event, details, req} = params;

	await logAuditWithContext({
		clerkUserId,
		event: `AUTH_${event.toUpperCase()}`,
		details: details || '',
		location: 'auth',
		req,
		metadata: {
			eventType: event,
		},
	});
}

/**
 * Log permission changes
 */
export async function logPermissionChange(params: {
	adminClerkUserId: string;
	targetClerkUserId: string;
	targetUserName: string;
	oldRole?: string;
	newRole: string;
	oldLocations?: string[];
	newLocations: string[];
	reason?: string;
}) {
	const {adminClerkUserId, targetClerkUserId, targetUserName, oldRole, newRole, oldLocations, newLocations, reason} = params;

	const details = [
		`target=${targetClerkUserId}`,
		`targetName=${targetUserName}`,
		oldRole ? `oldRole=${oldRole}` : '',
		`newRole=${newRole}`,
		oldLocations ? `oldLocations=${oldLocations.join(',')}` : '',
		`newLocations=${newLocations.join(',')}`,
		reason ? `reason=${reason}` : '',
	]
		.filter(Boolean)
		.join(',');

	await logAudit({
		clerkUserId: adminClerkUserId,
		event: 'PERMISSION_CHANGE',
		details,
		deviceId: 'admin',
		location: 'admin',
	});
}

/**
 * Batch log multiple audit events (for performance)
 */
export async function logAuditBatch(logs: LogAuditParams[]) {
	const logsWithTimestamp = logs.map((log) => ({
		...log,
		timestamp: new Date(),
	}));

	await db.insert(auditLogs).values(logsWithTimestamp);
}
