// db/mutations/vacation-requests.ts
import {db} from '../index';
import {vacationRequests} from '../schema';
import {requireCareAccess} from '@/lib/db-helpers';
import {eq} from 'drizzle-orm';
import {getFullUserData} from '../queries/users';

// Create a new vacation request
export async function createVacationRequest(args: {
	clerkUserId: string;
	startDate: Date;
	endDate: Date;
	reason?: string;
}) {
	const {clerkUserId, startDate, endDate, reason} = args;

	// Validate user access
	await requireCareAccess(clerkUserId);

	// Get user name
	const user = await getFullUserData(clerkUserId);
	const employeeName = user?.name || 'Unknown';

	// Validate dates
	if (startDate >= endDate) {
		throw new Error('End date must be after start date');
	}

	if (startDate < new Date()) {
		throw new Error('Start date cannot be in the past');
	}

	const [newRequest] = await db
		.insert(vacationRequests)
		.values({
			employeeClerkUserId: clerkUserId,
			employeeName,
			startDate,
			endDate,
			reason: reason || '',
			status: 'pending',
			createdAt: new Date(),
			updatedAt: new Date(),
		})
		.returning();

	return newRequest;
}

// Update vacation request status (approve/deny)
export async function updateVacationRequestStatus(args: {
	clerkUserId: string;
	requestId: string;
	status: 'approved' | 'denied';
	adminComments?: string;
}) {
	const {clerkUserId, requestId, status, adminComments} = args;

	// Validate admin access
	const userRole = await requireCareAccess(clerkUserId);
	if (userRole.role !== 'admin') {
		throw new Error('Only admins can approve or deny vacation requests');
	}

	// Get admin name
	const admin = await getFullUserData(clerkUserId);
	const adminName = admin?.name || 'Admin';

	const [updatedRequest] = await db
		.update(vacationRequests)
		.set({
			status,
			adminComments: adminComments || '',
			adminClerkUserId: clerkUserId,
			adminName,
			respondedAt: new Date(),
			updatedAt: new Date(),
		})
		.where(eq(vacationRequests.id, requestId))
		.returning();

	if (!updatedRequest) {
		throw new Error('Vacation request not found');
	}

	return updatedRequest;
}

// Delete vacation request (employee can delete their own pending requests)
export async function deleteVacationRequest(args: {
	clerkUserId: string;
	requestId: string;
}) {
	const {clerkUserId, requestId} = args;

	await requireCareAccess(clerkUserId);

	// Get the request first
	const [request] = await db
		.select()
		.from(vacationRequests)
		.where(eq(vacationRequests.id, requestId))
		.limit(1);

	if (!request) {
		throw new Error('Vacation request not found');
	}

	// Only allow deletion if:
	// 1. User is the employee who created it and status is pending
	// 2. User is admin
	const userRole = await requireCareAccess(clerkUserId);
	const isOwner = request.employeeClerkUserId === clerkUserId;
	const isAdmin = userRole.role === 'admin';

	if (!isAdmin && (!isOwner || request.status !== 'pending')) {
		throw new Error('You can only delete your own pending vacation requests');
	}

	await db.delete(vacationRequests).where(eq(vacationRequests.id, requestId));

	return {success: true};
}
