import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {employees, roles, users} from '@/db/schema';
import {requireRoleOrPrivilege} from '@/lib/auth';
import {internalServerError} from '@/lib/api-errors';
import {eq} from 'drizzle-orm';

export async function GET() {
	try {
		await requireRoleOrPrivilege(['admin'], ['manage_employees']);

		// Fetch all employees with their roles and user info
		const allEmployees = await db
			.select({
				id: employees.id,
				clerkUserId: employees.clerkUserId,
				name: users.name,
				email: users.email,
				role: roles.role,
				locations: employees.locations,
				employmentStatus: employees.employmentStatus,
			})
			.from(employees)
			.leftJoin(roles, eq(employees.clerkUserId, roles.clerkUserId))
			.leftJoin(users, eq(employees.clerkUserId, users.clerkUserId))
			.where(eq(employees.employmentStatus, 'active'));

		return NextResponse.json(allEmployees);
	} catch (error) {
		return internalServerError(error, 'GetAllEmployees');
	}
}
