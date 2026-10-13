import {and, asc, count, eq, isNull} from 'drizzle-orm';
import {db} from '@/db/index';
import {employees, locations, staffDocuments, staffRosterEntries} from '@/db/schema';
import {getRosterHomesByEmployee} from '@/db/queries/staff-documents';
import {canViewStaffDocument, type StaffDocumentViewer} from '@/lib/staff-documents';
import {canViewHome} from '@/lib/staff-directory';

/** Homes this viewer can open, with roster and home-document counts. */
export async function listDirectoryHomes(viewer: StaffDocumentViewer) {
	const [homeRows, rosterCounts, documentCounts] = await Promise.all([
		db
			.select({name: locations.name, address: locations.address, phone: locations.phone})
			.from(locations)
			.orderBy(asc(locations.name)),
		db
			.select({location: staffRosterEntries.location, n: count()})
			.from(staffRosterEntries)
			.groupBy(staffRosterEntries.location),
		db
			.select({location: staffDocuments.location, n: count()})
			.from(staffDocuments)
			.where(isNull(staffDocuments.archivedAt))
			.groupBy(staffDocuments.location),
	]);

	const staffCount = new Map(rosterCounts.map((row) => [row.location, row.n]));
	const documentCount = new Map(documentCounts.map((row) => [row.location, row.n]));
	return homeRows
		.filter((home) => canViewHome(viewer, home.name))
		.map((home) => ({
			...home,
			staffCount: staffCount.get(home.name) ?? 0,
			documentCount: documentCount.get(home.name) ?? 0,
		}));
}

/**
 * One home's roster, or null when it doesn't exist or isn't the viewer's.
 * Admins also get the employees not yet on this roster, for the add picker.
 */
export async function getDirectoryHome(viewer: StaffDocumentViewer, name: string) {
	if (!canViewHome(viewer, name)) return null;

	const [home] = await db
		.select({name: locations.name, address: locations.address, phone: locations.phone})
		.from(locations)
		.where(eq(locations.name, name))
		.limit(1);
	if (!home) return null;

	const roster = await db
		.select({
			entryId: staffRosterEntries.id,
			employeeId: employees.id,
			name: employees.name,
			title: staffRosterEntries.title,
			rosterHireDate: staffRosterEntries.rosterHireDate,
			employmentStatus: employees.employmentStatus,
			phone: employees.phone,
		})
		.from(staffRosterEntries)
		.innerJoin(employees, eq(staffRosterEntries.employeeId, employees.id))
		.where(eq(staffRosterEntries.location, name))
		.orderBy(asc(employees.name));

	let addable: {id: string; name: string}[] = [];
	if (viewer.role === 'admin') {
		const onRoster = new Set(roster.map((row) => row.employeeId));
		const all = await db
			.select({id: employees.id, name: employees.name})
			.from(employees)
			.orderBy(asc(employees.name));
		addable = all.filter((employee) => !onRoster.has(employee.id));
	}

	return {home, roster, addable};
}

/**
 * A staff member's full profile, or null when they don't exist or aren't
 * rostered at one of the viewer's homes (same rule as their documents).
 * Privileged supervisors see personal details too — decided 2026-10-12.
 */
export async function getStaffProfile(viewer: StaffDocumentViewer, employeeId: string) {
	const [employee] = await db
		.select({
			id: employees.id,
			name: employees.name,
			email: employees.email,
			workEmail: employees.workEmail,
			phone: employees.phone,
			dateOfBirth: employees.dateOfBirth,
			sex: employees.sex,
			homeAddress: employees.homeAddress,
			dateOfHire: employees.dateOfHire,
			employmentStatus: employees.employmentStatus,
			emergencyContactName: employees.emergencyContactName,
			emergencyContactPhone: employees.emergencyContactPhone,
			emergencyContactRelationship: employees.emergencyContactRelationship,
			profileNotes: employees.profileNotes,
		})
		.from(employees)
		.where(eq(employees.id, employeeId))
		.limit(1);
	if (!employee) return null;

	const homes = (await getRosterHomesByEmployee([employeeId])).get(employeeId) || [];
	if (
		!canViewStaffDocument(viewer, {location: null, employeeId, employeeLocations: homes})
	) {
		return null;
	}

	const rosterRows = await db
		.select({
			location: staffRosterEntries.location,
			title: staffRosterEntries.title,
			rosterHireDate: staffRosterEntries.rosterHireDate,
		})
		.from(staffRosterEntries)
		.where(eq(staffRosterEntries.employeeId, employeeId))
		.orderBy(asc(staffRosterEntries.location));

	return {
		...employee,
		dateOfHire: employee.dateOfHire ? employee.dateOfHire.toISOString().slice(0, 10) : null,
		// A supervisor only sees the homes they share with this person.
		homes: rosterRows.filter((row) => canViewHome(viewer, row.location)),
	};
}

export async function findRosterEntry(location: string, employeeId: string) {
	const [entry] = await db
		.select({id: staffRosterEntries.id})
		.from(staffRosterEntries)
		.where(
			and(eq(staffRosterEntries.location, location), eq(staffRosterEntries.employeeId, employeeId))
		)
		.limit(1);
	return entry ?? null;
}
