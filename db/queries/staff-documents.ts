import {and, desc, eq, inArray, isNull} from 'drizzle-orm';
import {db} from '@/db/index';
import {employees, locations, staffDocuments, staffRosterEntries} from '@/db/schema';
import {hasAdminPrivilege} from '@/db/queries/admin-privileges';
import {AccessDeniedError, getUserRoleDoc, logAudit} from '@/lib/db-helpers';
import {
	canViewStaffDocument,
	type StaffDocumentViewer,
} from '@/lib/staff-documents';

/**
 * Admins, plus supervisors the admin granted `view_staff_documents`.
 *
 * The role check is deliberate: the privileges screen also lists regular
 * staff, and a box ticked on the wrong row must not open background checks
 * to a care worker. Denials are audited like every other access gate.
 */
export async function requireStaffDocumentViewer(
	clerkUserId: string
): Promise<StaffDocumentViewer> {
	const userRole = await getUserRoleDoc(clerkUserId);
	const role = userRole?.role?.toLowerCase() || '';
	const viewer = {role, locations: userRole?.locations || []};

	if (role === 'admin') return viewer;
	if (
		role === 'supervisor' &&
		(await hasAdminPrivilege(clerkUserId, 'view_staff_documents'))
	) {
		return viewer;
	}

	await logAudit({
		clerkUserId,
		event: 'access_denied',
		details: `staff_documents_actual_${role}`,
		deviceId: 'system',
		location: '',
	});
	throw new AccessDeniedError('You do not have access to the staff directory');
}

/**
 * Which homes each employee is ROSTERED at. This — not employees.locations,
 * which also covers homes a floater merely works shifts at — decides where a
 * person's profile and documents are visible in the Staff Directory.
 */
export async function getRosterHomesByEmployee(employeeIds?: string[]) {
	if (employeeIds && employeeIds.length === 0) return new Map<string, string[]>();
	const rows = await db
		.select({employeeId: staffRosterEntries.employeeId, location: staffRosterEntries.location})
		.from(staffRosterEntries)
		.where(employeeIds ? inArray(staffRosterEntries.employeeId, employeeIds) : undefined);

	const homes = new Map<string, string[]>();
	for (const row of rows) {
		homes.set(row.employeeId, [...(homes.get(row.employeeId) || []), row.location]);
	}
	return homes;
}

const documentColumns = {
	id: staffDocuments.id,
	category: staffDocuments.category,
	employeeId: staffDocuments.employeeId,
	location: staffDocuments.location,
	title: staffDocuments.title,
	notes: staffDocuments.notes,
	fileStorageId: staffDocuments.fileStorageId,
	fileName: staffDocuments.fileName,
	fileSize: staffDocuments.fileSize,
	contentType: staffDocuments.contentType,
	uploadedAt: staffDocuments.uploadedAt,
	employeeName: employees.name,
};

type StaffDocumentRow = {
	id: string;
	category: string;
	employeeId: string | null;
	location: string | null;
	title: string;
	notes: string | null;
	fileStorageId: string;
	fileName: string;
	fileSize: number;
	contentType: string;
	uploadedAt: Date;
	employeeName: string | null;
};

type PlacedStaffDocumentRow = StaffDocumentRow & {employeeLocations: string[] | null};

async function withRosterHomes(rows: StaffDocumentRow[]): Promise<PlacedStaffDocumentRow[]> {
	const employeeIds = Array.from(
		new Set(rows.map((row) => row.employeeId).filter((id): id is string => Boolean(id)))
	);
	const homes = await getRosterHomesByEmployee(employeeIds);
	return rows.map((row) => ({
		...row,
		employeeLocations: row.employeeId ? homes.get(row.employeeId) || [] : null,
	}));
}

// The S3 key never leaves the server; downloads go through the
// privilege-checked route by document id.
function toListItem({fileStorageId: _key, ...row}: PlacedStaffDocumentRow) {
	return row;
}

/**
 * Active documents this viewer may see, newest first. The location filter
 * runs in code (canViewStaffDocument) rather than SQL so the list, the
 * download route and the tests all apply the exact same rule.
 */
export async function listVisibleStaffDocuments(
	viewer: StaffDocumentViewer,
	filter: {employeeId?: string; location?: string} = {}
) {
	const rows: StaffDocumentRow[] = await db
		.select(documentColumns)
		.from(staffDocuments)
		.leftJoin(employees, eq(staffDocuments.employeeId, employees.id))
		.where(
			and(
				isNull(staffDocuments.archivedAt),
				filter.employeeId ? eq(staffDocuments.employeeId, filter.employeeId) : undefined,
				filter.location ? eq(staffDocuments.location, filter.location) : undefined
			)
		)
		.orderBy(desc(staffDocuments.uploadedAt));

	const placed = await withRosterHomes(rows);
	return placed.filter((row) => canViewStaffDocument(viewer, row)).map(toListItem);
}

/**
 * One active document, or null when it doesn't exist, is archived, or sits
 * outside the viewer's homes. Callers answer all three the same way so the
 * response can't be used to probe which ids are real.
 */
export async function getVisibleStaffDocument(
	viewer: StaffDocumentViewer,
	documentId: string
) {
	const [row] = await db
		.select(documentColumns)
		.from(staffDocuments)
		.leftJoin(employees, eq(staffDocuments.employeeId, employees.id))
		.where(and(eq(staffDocuments.id, documentId), isNull(staffDocuments.archivedAt)))
		.limit(1);
	if (!row) return null;

	const [placed] = await withRosterHomes([row]);
	return canViewStaffDocument(viewer, placed) ? placed : null;
}

export function documentAuditLocation(row: {
	location: string | null;
	employeeLocations: string[] | null;
}) {
	return row.location ?? (row.employeeLocations || []).join('|');
}

/**
 * Employees and homes this viewer can file or filter by. Admins get every
 * employee (anyone can be given documents, rostered or not); supervisors get
 * the staff rostered at their homes.
 */
export async function listStaffDocumentFilterOptions(viewer: StaffDocumentViewer) {
	const [employeeRows, locationRows, homes] = await Promise.all([
		db
			.select({id: employees.id, name: employees.name})
			.from(employees)
			.orderBy(employees.name),
		db.select({name: locations.name}).from(locations).orderBy(locations.name),
		getRosterHomesByEmployee(),
	]);

	const isAdmin = viewer.role === 'admin';
	return {
		employees: employeeRows
			.map((employee) => ({...employee, locations: homes.get(employee.id) || []}))
			.filter((employee) =>
				canViewStaffDocument(viewer, {
					location: null,
					employeeId: employee.id,
					employeeLocations: employee.locations,
				})
			),
		locations: locationRows
			.map((row) => row.name)
			.filter((name) => isAdmin || viewer.locations.includes(name)),
	};
}
