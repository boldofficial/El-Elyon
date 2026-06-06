export const ADMIN_PRIVILEGES = [
	'manage_employees',
	'manage_residents',
	'manage_locations',
	'manage_devices',
	'manage_compliance',
	'manage_memos',
	'manage_vacation_requests',
	'manage_documents',
	'view_care_logs',
	'manage_guardian_checklists',
	'manage_data_cleanup',
	'manage_settings',
] as const;

export type AdminPrivilege = (typeof ADMIN_PRIVILEGES)[number];

export const ADMIN_PRIVILEGE_LABELS: Record<AdminPrivilege, string> = {
	manage_employees: 'Manage Employees',
	manage_residents: 'Manage Residents',
	manage_locations: 'Manage Locations',
	manage_devices: 'Manage Devices',
	manage_compliance: 'Manage Compliance',
	manage_memos: 'Manage Memos',
	manage_vacation_requests: 'Manage Vacation Requests',
	manage_documents: 'Manage Life Safety Documents',
	view_care_logs: 'View Care Logs & Incidents',
	manage_guardian_checklists: 'Manage Guardian Checklists',
	manage_data_cleanup: 'Run Data Cleanup',
	manage_settings: 'Manage Settings',
};

export function isAdminPrivilege(value: unknown): value is AdminPrivilege {
	return (
		typeof value === 'string' &&
		(ADMIN_PRIVILEGES as readonly string[]).includes(value)
	);
}

export function normalizeAdminPrivileges(values: unknown): AdminPrivilege[] {
	if (!Array.isArray(values)) return [];

	return Array.from(new Set(values.filter(isAdminPrivilege)));
}
