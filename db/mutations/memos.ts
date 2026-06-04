// db/mutations/memos.ts
import {db} from '../index';
import {memos, memosRead, shifts} from '../schema';
import {requireCareAccess} from '@/lib/db-helpers';
import {and, desc, eq, isNull} from 'drizzle-orm';
import {getFullUserData} from '../queries/users';

async function getActiveShiftLocation(clerkUserId: string) {
	const currentShift = await db.query.shifts.findFirst({
		where: and(eq(shifts.clerkUserId, clerkUserId), isNull(shifts.clockOutTime)),
		orderBy: [desc(shifts.clockInTime)],
	});

	return currentShift?.location ? [currentShift.location] : [];
}

// Create a new memo
export async function createMemo(args: {
	clerkUserId: string;
	title: string;
	content: string;
	recipientType: 'location' | 'all-staff' | 'all-supervisors' | 'all-employees' | 'selected-locations' | 'selected-users';
	targetLocations?: string[];
	targetUsers?: string[];
	priority?: 'normal' | 'high' | 'urgent';
	expiresAt?: Date;
}) {
	const {
		clerkUserId,
		title,
		content,
		recipientType,
		targetLocations = [],
		targetUsers = [],
		priority = 'normal',
		expiresAt,
	} = args;

	// Validate user access
	const userRole = await requireCareAccess(clerkUserId);
	const role = userRole.role?.toLowerCase();
	const senderLocations = userRole.locations?.length
		? userRole.locations
		: await getActiveShiftLocation(clerkUserId);

	// Get user name for sender
	const user = await getFullUserData(clerkUserId);
	const senderName = user?.name || 'Unknown';

	// Validate recipient type based on role
	if (role === 'staff') {
		// Staff can only send to their own location
		if (recipientType !== 'location') {
			throw new Error('Staff can only send memos to their own location');
		}
		if (senderLocations.length === 0) {
			throw new Error('Staff must have a location assigned');
		}
	} else if (role === 'supervisor') {
		// Supervisors can send to locations they manage
		if (recipientType === 'all-staff' || recipientType === 'all-supervisors' || recipientType === 'all-employees' || recipientType === 'selected-users') {
			throw new Error('Supervisors cannot send to all staff, all supervisors, all employees, or selected users');
		}
		if (recipientType === 'selected-locations') {
			// Verify supervisor manages all target locations
			const managedLocations = senderLocations;
			const invalidLocations = targetLocations.filter(
				(loc) => !managedLocations.includes(loc)
			);
			if (invalidLocations.length > 0) {
				throw new Error('Cannot send to locations you do not manage');
			}
		}
	}
	// Admin can send to anyone - no validation needed

	// Determine target locations and users
	let finalTargetLocations: string[] = [];
	let finalTargetUsers: string[] = [];
	
	if (recipientType === 'location') {
		// Send to sender's locations
		finalTargetLocations = senderLocations;
	} else if (recipientType === 'selected-locations') {
		finalTargetLocations = targetLocations;
	} else if (recipientType === 'selected-users') {
		finalTargetUsers = targetUsers;
	}
	// For 'all-staff' or 'all-supervisors', both remain empty (means all)

	const [newMemo] = await db
		.insert(memos)
		.values({
			title,
			content,
			senderClerkUserId: clerkUserId,
			senderName,
			recipientType,
			targetLocations: finalTargetLocations,
			targetUsers: finalTargetUsers,
			priority,
			expiresAt,
			createdAt: new Date(),
		})
		.returning();

	return newMemo;
}

// Mark memo as read
export async function markMemoAsRead(args: {
	clerkUserId: string;
	memoId: string;
}) {
	const {clerkUserId, memoId} = args;

	// Check if already marked as read
	const existing = await db.query.memosRead.findFirst({
		where: (memosRead, {and, eq}) =>
			and(eq(memosRead.memoId, memoId), eq(memosRead.clerkUserId, clerkUserId)),
	});

	if (existing) {
		return existing; // Already marked as read
	}

	const [readRecord] = await db
		.insert(memosRead)
		.values({
			memoId,
			clerkUserId,
			readAt: new Date(),
		})
		.returning();

	return readRecord;
}

// Delete a memo (only sender or admin can delete)
export async function deleteMemo(args: {
	clerkUserId: string;
	memoId: string;
}) {
	const {clerkUserId, memoId} = args;

	const userRole = await requireCareAccess(clerkUserId);

	// Get the memo
	const memo = await db.query.memos.findFirst({
		where: eq(memos.id, memoId),
	});

	if (!memo) {
		throw new Error('Memo not found');
	}

	// Only sender or admin can delete
	if (memo.senderClerkUserId !== clerkUserId && userRole.role !== 'admin') {
		throw new Error('Only the sender or admin can delete this memo');
	}

	await db.delete(memos).where(eq(memos.id, memoId));

	return {success: true};
}
