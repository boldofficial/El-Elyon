// lib/employee-access.ts
//
// What a caller may set when creating or editing an employee record. Factored
// out of db/mutations/employees.ts so the rule is tested without Clerk or a
// database.
//
// The mutations first require admin or the "Manage Employees" privilege
// (`manage_employees`) via requireAdminOrPrivilege; there is no self-service
// path. These checks then narrow what a delegated (non-admin) caller may do:
//
// - Only admins touch admins: a non-admin can't give anyone the admin role and
//   can't edit an existing admin's record at all.
// - A non-admin can't change their own role or locations, so a supervisor
//   holding manage_employees can't widen their own reach.

export type EmployeeRole = 'admin' | 'supervisor' | 'staff';

export type EmployeeActor = {
	clerkUserId: string;
	/** True for role 'admin'; false for a non-admin holding manage_employees. */
	isAdmin: boolean;
};

export type EmployeeAccessDecision = {ok: true} | {ok: false; reason: string};

const allowed: EmployeeAccessDecision = {ok: true};

function isAdminRole(role: string | null | undefined): boolean {
	return role?.toLowerCase() === 'admin';
}

function sameLocations(a: readonly string[], b: readonly string[]): boolean {
	const left = new Set(a);
	const right = new Set(b);
	return left.size === right.size && [...left].every((location) => right.has(location));
}

export function checkEmployeeCreate(
	actor: EmployeeActor,
	next: {role: EmployeeRole}
): EmployeeAccessDecision {
	if (!actor.isAdmin && isAdminRole(next.role)) {
		return {ok: false, reason: 'Only an admin can create an admin'};
	}
	return allowed;
}

export function checkEmployeeUpdate(
	actor: EmployeeActor,
	current: {clerkUserId: string | null; role: string | null; locations: string[] | null},
	next: {role: EmployeeRole; locations: string[]}
): EmployeeAccessDecision {
	if (actor.isAdmin) return allowed;

	if (isAdminRole(current.role)) {
		return {ok: false, reason: "Only an admin can edit an admin's record"};
	}
	if (isAdminRole(next.role)) {
		return {ok: false, reason: 'Only an admin can grant the admin role'};
	}

	const isSelf = current.clerkUserId !== null && current.clerkUserId === actor.clerkUserId;
	const roleChanged = (current.role ?? '').toLowerCase() !== next.role.toLowerCase();
	const locationsChanged = !sameLocations(current.locations ?? [], next.locations);
	if (isSelf && (roleChanged || locationsChanged)) {
		return {ok: false, reason: 'You cannot change your own role or locations'};
	}

	return allowed;
}
