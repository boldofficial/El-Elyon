/**
 * Who may edit an incident report, and for how long after it was filed.
 *
 * This module is intentionally free of database/server imports so the same
 * rule runs in two places:
 *   - server-side in `db/mutations/incident-reports.ts` (the enforcement point)
 *   - client-side in `SharedIncidentsAccordion` / `IncidentReportsList` (to
 *     decide whether to render the Edit button at all)
 *
 * Incident reports are compliance records, so the window is deliberately
 * short and only the original author qualifies. Anything past the window is
 * an amendment, not an edit, and must go through an admin.
 */

/** How long after filing the author may still edit their report. */
export const INCIDENT_EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The subset of an incident report the policy needs to decide. */
export interface IncidentEditSubject {
	/** Clerk user ID of the staff member who filed the report. */
	reportedBy: string;
	/** When the report was filed (not the incident's own date). */
	createdAt: Date | string | null | undefined;
}

/**
 * Thrown by the update mutation when the caller is not allowed to edit.
 * The API routes map this to a 403 rather than a generic 500.
 */
export class IncidentEditNotAllowedError extends Error {
	constructor(message = 'Forbidden: incident reports can only be edited by their author within 24 hours of filing') {
		super(message);
		this.name = 'IncidentEditNotAllowedError';
	}
}

/**
 * Returns true when `clerkUserId` may edit `report` at instant `now`.
 *
 * Rule: only the original author, and only while the report is younger
 * than INCIDENT_EDIT_WINDOW_MS (measured from `createdAt`, i.e. when it was
 * filed, not from `incidentDate`). A rolling window rather than "same
 * calendar day" so a report filed at 11:50 PM isn't locked ten minutes
 * later. Admins get no bypass: a post-window change to a compliance record
 * is an amendment and should leave its own trail. A report with no
 * `createdAt` is treated as not editable — we would rather refuse than guess.
 */
export function canEditIncidentReport(
	report: IncidentEditSubject,
	clerkUserId: string,
	now: Date = new Date()
): boolean {
	if (report.reportedBy !== clerkUserId) return false;
	if (!report.createdAt) return false;
	const filedAt = new Date(report.createdAt).getTime();
	if (Number.isNaN(filedAt)) return false;
	return now.getTime() - filedAt < INCIDENT_EDIT_WINDOW_MS;
}
