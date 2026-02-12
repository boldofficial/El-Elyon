// db/queries/vacation-requests.ts
import {db} from '../index';
import {vacationRequests} from '../schema';
import {requireCareAccess} from '@/lib/db-helpers';
import {and, desc, eq} from 'drizzle-orm';

// Get vacation requests (all for admin, own for employee)
export async function getVacationRequests(args: {
	clerkUserId: string;
	status?: 'pending' | 'approved' | 'denied';
	limit?: number;
}) {
	const {clerkUserId, status, limit = 100} = args;

	const userRole = await requireCareAccess(clerkUserId);
	const isAdmin = userRole.role === 'admin';

	const conditions: any[] = [];

	// Non-admin users only see their own requests
	if (!isAdmin) {
		conditions.push(eq(vacationRequests.employeeClerkUserId, clerkUserId));
	}

	// Filter by status if provided
	if (status) {
		conditions.push(eq(vacationRequests.status, status));
	}

	const query = db
		.select()
		.from(vacationRequests)
		.orderBy(desc(vacationRequests.createdAt))
		.limit(limit);

	if (conditions.length > 0) {
		return await query.where(and(...conditions));
	}

	return await query;
}

// Get single vacation request by ID
export async function getVacationRequestById(args: {
	clerkUserId: string;
	requestId: string;
}) {
	const {clerkUserId, requestId} = args;

	await requireCareAccess(clerkUserId);

	const [request] = await db
		.select()
		.from(vacationRequests)
		.where(eq(vacationRequests.id, requestId))
		.limit(1);

	if (!request) {
		return null;
	}

	// Verify access: admin or owner
	const userRole = await requireCareAccess(clerkUserId);
	const isAdmin = userRole.role === 'admin';
	const isOwner = request.employeeClerkUserId === clerkUserId;

	if (!isAdmin && !isOwner) {
		throw new Error('You do not have access to this vacation request');
	}

	return request;
}

// Get pending vacation requests count (for admin badge)
export async function getPendingVacationRequestsCount(clerkUserId: string) {
	const userRole = await requireCareAccess(clerkUserId);

	// Only admins see pending count
	if (userRole.role !== 'admin') {
		return 0;
	}

	const results = await db
		.select()
		.from(vacationRequests)
		.where(eq(vacationRequests.status, 'pending'));

	return results.length;
}
