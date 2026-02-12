// db/queries/memos.ts
import {db} from '../index';
import {memos, memosRead, roles} from '../schema';
import {requireCareAccess} from '@/lib/db-helpers';
import {and, desc, eq, inArray, or, sql, isNull, gt} from 'drizzle-orm';

// Get memos for current user
export async function getMemos(args: {
	clerkUserId: string;
	limit?: number;
	unreadOnly?: boolean;
}) {
	const {clerkUserId, limit = 50, unreadOnly = false} = args;

	const userRole = await requireCareAccess(clerkUserId);
	const role = userRole.role?.toLowerCase();
	const userLocations = userRole.locations || [];

	// Build query conditions based on role and recipient type
	let memoQuery = db
		.select({
			memo: memos,
			isRead: sql<boolean>`EXISTS (
				SELECT 1 FROM ${memosRead}
				WHERE ${memosRead.memoId} = ${memos.id}
				AND ${memosRead.clerkUserId} = ${clerkUserId}
			)`,
		})
		.from(memos)
		.orderBy(desc(memos.createdAt))
		.limit(limit);

	// Filter based on recipient type and user role
	const conditions: any[] = [];

	if (role === 'admin') {
		// Admins see:
		// 1. Memos sent to all-staff
		// 2. Memos sent to all-supervisors
		// 3. Memos sent to all-employees
		// 4. Memos they sent
		// 5. Location-based memos (since admins have access to all locations)
		// 6. Memos sent directly to them (selected-users)
		conditions.push(
			or(
				eq(memos.recipientType, 'all-staff'),
				eq(memos.recipientType, 'all-supervisors'),
				eq(memos.recipientType, 'all-employees'),
				eq(memos.senderClerkUserId, clerkUserId),
				and(
					eq(memos.recipientType, 'selected-users'),
					sql`${memos.targetUsers}::jsonb ? ${clerkUserId}`
				)
			)
		);
	} else if (role === 'supervisor') {
		// Supervisors see:
		// 1. Memos sent to all-supervisors
		// 2. Memos sent to all-employees
		// 3. Memos sent to their managed locations
		// 4. Memos they sent
		// 5. Memos sent directly to them (selected-users)
		
		// Build location check conditions safely (each location is parameterized separately)
		const locationCheckConditions = userLocations.length > 0
			? userLocations.map(loc => 
				sql`${memos.targetLocations}::jsonb ? ${loc}`
			)
			: [];

		conditions.push(
			or(
				eq(memos.recipientType, 'all-supervisors'),
				eq(memos.recipientType, 'all-employees'),
				eq(memos.senderClerkUserId, clerkUserId),
				// Location-based memos
				...(locationCheckConditions.length > 0 
					? [
						and(
							eq(memos.recipientType, 'location'),
							or(...locationCheckConditions)
						),
						and(
							eq(memos.recipientType, 'selected-locations'),
							or(...locationCheckConditions)
						)
					]
					: []
				),
				// Selected users
				and(
					eq(memos.recipientType, 'selected-users'),
					sql`${memos.targetUsers}::jsonb ? ${clerkUserId}`
				)
			)
		);
	} else {
		// Staff see:
		// 1. Memos sent to all-staff
		// 2. Memos sent to all-employees
		// 3. Memos sent to their location
		// 4. Memos they sent
		// 5. Memos sent directly to them (selected-users)
		
		// Build location check conditions safely (each location is parameterized separately)
		const locationCheckConditions = userLocations.length > 0
			? userLocations.map(loc => 
				sql`${memos.targetLocations}::jsonb ? ${loc}`
			)
			: [];

		conditions.push(
			or(
				eq(memos.recipientType, 'all-staff'),
				eq(memos.recipientType, 'all-employees'),
				eq(memos.senderClerkUserId, clerkUserId),
				// Location-based memos
				...(locationCheckConditions.length > 0 
					? [
						and(
							eq(memos.recipientType, 'location'),
							or(...locationCheckConditions)
						),
						and(
							eq(memos.recipientType, 'selected-locations'),
							or(...locationCheckConditions)
						)
					]
					: []
				),
				// Selected users
				and(
					eq(memos.recipientType, 'selected-users'),
					sql`${memos.targetUsers}::jsonb ? ${clerkUserId}`
				)
			)
		);
	}

	// Filter expired memos
	conditions.push(
		or(isNull(memos.expiresAt), gt(memos.expiresAt, new Date()))
	);

	const results = await memoQuery.where(and(...conditions));

	// Filter unread if requested
	if (unreadOnly) {
		return results.filter((r) => !r.isRead);
	}

	return results;
}

// Get single memo by ID
export async function getMemoById(args: {
	clerkUserId: string;
	memoId: string;
}) {
	const {clerkUserId, memoId} = args;

	await requireCareAccess(clerkUserId);

	const result = await db
		.select({
			memo: memos,
			isRead: sql<boolean>`EXISTS (
				SELECT 1 FROM ${memosRead}
				WHERE ${memosRead.memoId} = ${memos.id}
				AND ${memosRead.clerkUserId} = ${clerkUserId}
			)`,
		})
		.from(memos)
		.where(eq(memos.id, memoId))
		.limit(1);

	return result[0] || null;
}

// Get unread count
export async function getUnreadMemoCount(clerkUserId: string) {
	const allMemos = await getMemos({clerkUserId, limit: 1000});
	return allMemos.filter((m) => !m.isRead).length;
}
