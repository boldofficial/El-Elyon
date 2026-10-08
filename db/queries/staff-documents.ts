import {and, desc, eq, isNull} from 'drizzle-orm';
import {db} from '@/db/index';
import {employees, locations, staffDocuments} from '@/db/schema';
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
	throw new AccessDeniedError('You do not have access to staff documents');
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
	employeeLocations: employees.locations,
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
	employeeLocations: string[] | null;
};

// The S3 key never leaves the server; downloads go through the
// privilege-checked route by document id.
function toListItem({fileStorageId: _key, ...row}: StaffDocumentRow) {
	return row;
}

/**
 * Active documents this viewer may see, newest first. The location filter
 * runs in code (canViewStaffDocument) rather than SQL so the list, the
 * download route and the tests all apply the exact same rule.
 */
export async function listVisibleStaffDocuments(
	viewer: StaffDocumentViewer,
	filter: {employeeId?: string} = {}
) {
	const rows: StaffDocumentRow[] = await db
		.select(documentColumns)
		.from(staffDocuments)
		.leftJoin(employees, eq(staffDocuments.employeeId, employees.id))
		.where(
			and(
				isNull(staffDocuments.archivedAt),
				filter.employeeId
					? eq(staffDocuments.employeeId, filter.employeeId)
					: undefined
			)
		)
		.orderBy(desc(staffDocuments.uploadedAt));

	return rows.filter((row) => canViewStaffDocument(viewer, row)).map(toListItem);
}

/**
 * One active document, or null when it doesn't exist, is archived, or sits
 * outside the viewer's locations. Callers answer all three the same way so
 * the response can't be used to probe which ids are real.
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

	if (!row || !canViewStaffDocument(viewer, row)) return null;
	return row as StaffDocumentRow;
}

export function documentAuditLocation(row: {
	location: string | null;
	employeeLocations: string[] | null;
}) {
	return row.location ?? (row.employeeLocations || []).join('|');
}

/**
 * Employees and locations this viewer can filter by (and, for admins, file
 * uploads under). Same scoping rule as the documents themselves.
 */
export async function listStaffDocumentFilterOptions(viewer: StaffDocumentViewer) {
	const [employeeRows, locationRows] = await Promise.all([
		db
			.select({id: employees.id, name: employees.name, locations: employees.locations})
			.from(employees)
			.orderBy(employees.name),
		db.select({name: locations.name}).from(locations).orderBy(locations.name),
	]);

	const isAdmin = viewer.role === 'admin';
	return {
		employees: employeeRows.filter((employee) =>
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
