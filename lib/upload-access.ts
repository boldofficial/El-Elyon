// lib/upload-access.ts
//
// Authorization for the generic /api/uploads route. A storage key on its own
// says nothing about who may read it, so non-admin reads are decided by the
// database rows that reference the key, using the same rule each of those
// records already enforces in its own route.

import {db} from '../db/index';
import {
	employees,
	employeeTrainings,
	fireEvac,
	hrFiles,
	incidentReports,
	ispFiles,
	residentDocuments,
} from '../db/schema';
import {eq, or, sql} from 'drizzle-orm';
import {logAudit, residentInScope} from './db-helpers';

/**
 * Staff documents have their own privilege-checked download route
 * (/api/staff-documents/[id]/download). The generic route must never serve,
 * delete, or write under this prefix, or that route's checks could be skipped.
 */
export const STAFF_DOCUMENTS_PREFIX = 'staff-documents/';

export function isStaffDocumentKey(fileKey: string) {
	return fileKey.startsWith(STAFF_DOCUMENTS_PREFIX);
}

/**
 * Upload prefixes each role may write. Every existing caller of
 * POST /api/uploads sends one of these as `fileType`; anything else (including
 * a client-supplied 'staff-documents' or a path like '../x') is refused.
 * Mirrors the write rule of the route that later stores the key:
 * isp-files POST is admin/supervisor, createFireEvacPlan allows any care role,
 * employee HR + training routes are admin.
 */
const UPLOAD_PREFIX_ROLES = new Map<string, readonly string[]>([
	['incident-attachments', ['admin', 'supervisor', 'staff']],
	['resident-documents', ['admin', 'supervisor', 'staff']],
	['isp-files', ['admin', 'supervisor']],
	['fire-evac', ['admin', 'supervisor', 'staff']],
	['tb_test', ['admin']],
	['background_check', ['admin']],
	['application_form', ['admin']],
	['training_certificates', ['admin']],
]);

export function canUploadAs(role: string | null | undefined, fileType: string) {
	return !!UPLOAD_PREFIX_ROLES.get(fileType)?.includes((role || '').toLowerCase());
}

/** A database row that references a storage key. */
export type FileOwner =
	| {kind: 'resident'; residentId: string; source: string}
	| {kind: 'employee'; source: string};

/**
 * Every row that references `fileKey`. A key can legitimately appear more than
 * once (a resident document re-linked as an ISP), and some write routes accept
 * any client-supplied key, so callers must satisfy *every* owner -- never just
 * the first one found.
 */
export async function findFileOwners(fileKey: string): Promise<FileOwner[]> {
	const [docs, isps, plans, incidents, hrEmployees, hrFileRows, trainings] =
		await Promise.all([
			db.query.residentDocuments.findMany({
				where: eq(residentDocuments.fileStorageId, fileKey),
				columns: {residentId: true},
			}),
			db.query.ispFiles.findMany({
				where: eq(ispFiles.fileStorageId, fileKey),
				columns: {residentId: true},
			}),
			db.query.fireEvac.findMany({
				where: eq(fireEvac.fileStorageId, fileKey),
				columns: {residentId: true},
			}),
			db.query.incidentReports.findMany({
				where: sql`${incidentReports.attachments} @> ${JSON.stringify([fileKey])}::jsonb`,
				columns: {residentId: true},
			}),
			db.query.employees.findMany({
				where: or(
					eq(employees.tbTestFileId, fileKey),
					eq(employees.backgroundCheckFileId, fileKey),
					eq(employees.applicationFormFileId, fileKey)
				),
				columns: {id: true},
			}),
			db.query.hrFiles.findMany({
				where: eq(hrFiles.fileStorageId, fileKey),
				columns: {id: true},
			}),
			db.query.employeeTrainings.findMany({
				where: eq(employeeTrainings.certificateFileId, fileKey),
				columns: {id: true},
			}),
		]);

	const resident = (source: string) => (row: {residentId: string}) =>
		({kind: 'resident', residentId: row.residentId, source}) as const;
	const employee = (source: string) => () => ({kind: 'employee', source}) as const;

	return [
		...docs.map(resident('resident_document')),
		...isps.map(resident('isp_file')),
		...plans.map(resident('fire_evac')),
		...incidents.map(resident('incident_attachment')),
		...hrEmployees.map(employee('employee_hr')),
		...hrFileRows.map(employee('hr_file')),
		...trainings.map(employee('training_certificate')),
	];
}

async function denyRead(clerkUserId: string, reason: string, fileKey: string) {
	await logAudit({
		clerkUserId,
		event: 'access_denied',
		details: `uploads_read_${reason}_${fileKey}`,
		deviceId: 'system',
		location: '',
	});
	return false;
}

/**
 * Whether `userRole` may read the object at `fileKey`. Every denial is audited
 * (resident scope denials by residentInScope itself). Returns true to allow.
 *
 * - staff-documents keys are refused for everyone, admins included.
 * - Admins may read any other key. That keeps admin-only flows working that
 *   preview a file before its row is saved (training certificates, HR files).
 * - Supervisors and staff need at least one owning row and must pass every
 *   one: HR/training owners are admin-only, resident owners must be in one of
 *   the caller's locations. An unreferenced key is refused, not reported
 *   missing, so callers cannot probe which keys exist.
 */
export async function canReadUpload(args: {
	clerkUserId: string;
	userRole: {role: string | null; locations?: string[] | null} | null | undefined;
	fileKey: string;
}): Promise<boolean> {
	const {clerkUserId, userRole, fileKey} = args;

	if (isStaffDocumentKey(fileKey)) {
		return denyRead(clerkUserId, 'staff_document', fileKey);
	}

	const role = (userRole?.role || '').toLowerCase();
	if (!userRole || !['admin', 'supervisor', 'staff'].includes(role)) {
		return denyRead(clerkUserId, `role_${role}`, fileKey);
	}
	if (role === 'admin') return true;

	const owners = await findFileOwners(fileKey);
	if (owners.length === 0) {
		return denyRead(clerkUserId, 'unreferenced', fileKey);
	}

	const employeeOwner = owners.find((owner) => owner.kind === 'employee');
	if (employeeOwner) {
		return denyRead(clerkUserId, employeeOwner.source, fileKey);
	}

	const residentIds = new Set(
		owners.flatMap((owner) => (owner.kind === 'resident' ? [owner.residentId] : []))
	);
	for (const residentId of residentIds) {
		const allowed = await residentInScope({
			clerkUserId,
			userRole,
			residentId,
			auditDetail: 'uploads_read_cross_location',
		});
		if (!allowed) return false;
	}
	return true;
}
