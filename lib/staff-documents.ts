// Staff documents shown to state inspectors on site.
//
// Admins upload; supervisors the admin has granted `view_staff_documents`
// can view and download, but only for staff at their own location(s).
// Everything here is pure so the rules can be tested without a database —
// the API routes and the UI both import from this file.

export const STAFF_DOCUMENT_CATEGORIES = [
	'staff_roster',
	'training',
	'background_check',
	'tb_test',
	'job_application',
	'prn_staff',
	'cla',
	'miscellaneous',
] as const;

export type StaffDocumentCategory = (typeof STAFF_DOCUMENT_CATEGORIES)[number];

export const STAFF_DOCUMENT_CATEGORY_LABELS: Record<StaffDocumentCategory, string> = {
	staff_roster: 'Staff Roster',
	training: 'Training',
	background_check: 'Background Check',
	tb_test: 'TB Test',
	job_application: 'Job Application',
	prn_staff: 'PRN Staff',
	cla: 'CLA Documents',
	miscellaneous: 'Miscellaneous',
};

// What a document is filed under:
//   employee — about one person; visible wherever that person works
//   location — facility-wide; visible at that one house
//   either   — the admin picks one when uploading
export type StaffDocumentScope = 'employee' | 'location' | 'either';

export const STAFF_DOCUMENT_CATEGORY_SCOPE: Record<StaffDocumentCategory, StaffDocumentScope> = {
	staff_roster: 'location',
	training: 'employee',
	background_check: 'employee',
	tb_test: 'employee',
	job_application: 'employee',
	prn_staff: 'location',
	cla: 'location',
	miscellaneous: 'either',
};

export function isStaffDocumentCategory(value: unknown): value is StaffDocumentCategory {
	return (
		typeof value === 'string' &&
		(STAFF_DOCUMENT_CATEGORIES as readonly string[]).includes(value)
	);
}

// Uploads pass through a Vercel function, which rejects request bodies over
// ~4.5 MB. Larger scans need direct-to-bucket uploads (presigned PUT), which
// in turn need CORS on the R2 bucket — not set up yet.
export const STAFF_DOCUMENT_MAX_BYTES = 4 * 1024 * 1024;

export const STAFF_DOCUMENT_CONTENT_TYPES = [
	'application/pdf',
	'application/msword',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/vnd.ms-excel',
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
	'text/csv',
	'image/jpeg',
	'image/png',
] as const;

/**
 * Checks that an upload is filed under exactly one thing, and the right kind
 * of thing for its category. Exactly one, not "at least one": a TB test that
 * also carried a location would show at a house the person may not work at.
 *
 * Returns the normalized target, or an error message for the admin.
 */
export function resolveStaffDocumentTarget(input: {
	category: unknown;
	employeeId?: unknown;
	location?: unknown;
}):
	| {ok: true; category: StaffDocumentCategory; employeeId: string | null; location: string | null}
	| {ok: false; error: string} {
	if (!isStaffDocumentCategory(input.category)) {
		return {ok: false, error: 'Choose a document category'};
	}
	const category = input.category;
	const employeeId =
		typeof input.employeeId === 'string' && input.employeeId.trim() ? input.employeeId.trim() : null;
	const location =
		typeof input.location === 'string' && input.location.trim() ? input.location.trim() : null;

	if (employeeId && location) {
		return {ok: false, error: 'File this under an employee or a location, not both'};
	}

	const scope = STAFF_DOCUMENT_CATEGORY_SCOPE[category];
	const label = STAFF_DOCUMENT_CATEGORY_LABELS[category];
	if (scope === 'employee' && !employeeId) {
		return {ok: false, error: `${label} documents belong to an employee — choose one`};
	}
	if (scope === 'location' && !location) {
		return {ok: false, error: `${label} documents belong to a location — choose one`};
	}
	if (scope === 'either' && !employeeId && !location) {
		return {ok: false, error: 'Choose an employee or a location for this document'};
	}

	return {ok: true, category, employeeId, location};
}

export type StaffDocumentViewer = {
	role: string | null;
	locations: string[];
};

export type StaffDocumentPlacement = {
	// Set for facility-wide documents.
	location: string | null;
	// Set for employee documents: where that employee works.
	employeeId: string | null;
	employeeLocations: string[] | null;
};

/**
 * Can this viewer see this document? Callers have already checked that the
 * viewer is an admin or a supervisor holding `view_staff_documents`; this
 * decides the location scoping on top of that.
 */
export function canViewStaffDocument(
	viewer: StaffDocumentViewer,
	doc: StaffDocumentPlacement
): boolean {
	if ((viewer.role || '').toLowerCase() === 'admin') return true;

	// Facility-wide document: only at its own house.
	if (doc.location) return viewer.locations.includes(doc.location);

	// Employee document: wherever that employee works. An employee with no
	// locations matches no one, so only the admin sees their documents —
	// decided 2026-10-08: assign them a location to open them to supervisors.
	return (doc.employeeLocations || []).some((location) =>
		viewer.locations.includes(location)
	);
}
