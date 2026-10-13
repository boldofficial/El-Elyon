// Staff Directory: homes → roster → staff profile + documents.
//
// Pure rules shared by the API routes, the UI and the tests. Access follows
// lib/staff-documents.ts: admins see everything; supervisors holding
// `view_staff_documents` see the homes they're assigned to, and the staff
// ROSTERED at those homes. Only admins edit profiles and rosters.

export const STAFF_SEX_OPTIONS = ['female', 'male'] as const;
export type StaffSex = (typeof STAFF_SEX_OPTIONS)[number];
export const STAFF_SEX_LABELS: Record<StaffSex, string> = {female: 'Female', male: 'Male'};

// employees.employment_status. 'pending' predates the directory (set on
// invite) and is shown as-is; the directory only ever writes these two.
export const STAFF_STATUS_OPTIONS = ['active', 'inactive'] as const;
export type StaffStatus = (typeof STAFF_STATUS_OPTIONS)[number];

export type StaffProfileUpdate = {
	phone?: string | null;
	dateOfBirth?: string | null;
	sex?: StaffSex | null;
	homeAddress?: string | null;
	dateOfHire?: string | null;
	employmentStatus?: StaffStatus;
	emergencyContactName?: string | null;
	emergencyContactPhone?: string | null;
	emergencyContactRelationship?: string | null;
	profileNotes?: string | null;
};

const TEXT_LIMITS = {
	phone: 50,
	homeAddress: 500,
	emergencyContactName: 255,
	emergencyContactPhone: 50,
	emergencyContactRelationship: 100,
	profileNotes: 5000,
} as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string) {
	if (!ISO_DATE.test(value)) return false;
	const [y, m, d] = value.split('-').map(Number);
	const date = new Date(Date.UTC(y, m - 1, d));
	return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/**
 * Validates an admin's profile edit. Only keys present in the body are
 * changed; an empty string clears a field. Name and email are not editable
 * here — they're tied to the login and stay in People management.
 */
export function parseStaffProfileUpdate(
	body: unknown,
	today: string
): {ok: true; update: StaffProfileUpdate} | {ok: false; error: string} {
	if (!body || typeof body !== 'object') return {ok: false, error: 'Nothing to update'};
	const input = body as Record<string, unknown>;
	const update: StaffProfileUpdate = {};

	for (const [key, limit] of Object.entries(TEXT_LIMITS) as [keyof typeof TEXT_LIMITS, number][]) {
		if (!(key in input)) continue;
		const value = input[key];
		if (value !== null && typeof value !== 'string') return {ok: false, error: `Invalid ${key}`};
		const trimmed = (value ?? '').trim();
		if (trimmed.length > limit) return {ok: false, error: `${key} is too long`};
		update[key] = trimmed || null;
	}

	for (const key of ['dateOfBirth', 'dateOfHire'] as const) {
		if (!(key in input)) continue;
		const value = input[key];
		if (value === null || value === '') {
			update[key] = null;
			continue;
		}
		if (typeof value !== 'string' || !isCalendarDate(value)) {
			return {ok: false, error: key === 'dateOfBirth' ? 'Enter a valid date of birth' : 'Enter a valid date of hire'};
		}
		if (key === 'dateOfBirth' && value >= today) {
			return {ok: false, error: 'Date of birth must be in the past'};
		}
		update[key] = value;
	}

	if ('sex' in input) {
		const value = input.sex;
		if (value === null || value === '') update.sex = null;
		else if ((STAFF_SEX_OPTIONS as readonly unknown[]).includes(value)) update.sex = value as StaffSex;
		else return {ok: false, error: 'Choose Female or Male'};
	}

	if ('employmentStatus' in input) {
		const value = input.employmentStatus;
		if (!(STAFF_STATUS_OPTIONS as readonly unknown[]).includes(value)) {
			return {ok: false, error: 'Status must be Active or Inactive'};
		}
		update.employmentStatus = value as StaffStatus;
	}

	if (Object.keys(update).length === 0) return {ok: false, error: 'Nothing to update'};
	return {ok: true, update};
}

/** A home a supervisor can open: admins any, everyone else their own. */
export function canViewHome(viewer: {role: string | null; locations: string[]}, home: string) {
	return (viewer.role || '').toLowerCase() === 'admin' || viewer.locations.includes(home);
}
