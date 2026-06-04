import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {eq} from 'drizzle-orm';
import {db} from '@/db/index';
import {employees, roles, users} from '@/db/schema';
import {getClerkUser} from '@/lib/clerk';
import {getEmployeeByClerkId, getEmployeeByEmail} from '@/db/queries/employees';
import {checkForAdmins, getRoleByClerkId} from '@/db/queries/roles';
import {getUserByClerkId, getUserByEmail} from '@/db/queries/users';

const validRoles = ['admin', 'supervisor', 'staff'] as const;
type UserRole = (typeof validRoles)[number];

function normalizeRole(role: unknown): UserRole | undefined {
	if (typeof role !== 'string') return undefined;
	const normalized = role.toLowerCase();
	return validRoles.includes(normalized as UserRole)
		? (normalized as UserRole)
		: undefined;
}

function mergeLocations(...locationSets: Array<unknown>): string[] {
	const merged = new Set<string>();

	for (const locationSet of locationSets) {
		if (!Array.isArray(locationSet)) continue;

		for (const location of locationSet) {
			if (typeof location === 'string' && location.trim()) {
				merged.add(location);
			}
		}
	}

	return Array.from(merged);
}

export async function POST(request: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		console.log('Auto-syncing user:', userId);

		let fallbackUserData: {
			email?: string;
			name?: string;
		} = {};

		try {
			fallbackUserData = await request.json();
		} catch {
			fallbackUserData = {};
		}

		const clerkUserData = await getClerkUser(userId);

		if (!clerkUserData) {
			return NextResponse.json(
				{error: 'Failed to verify user identity with Clerk'},
				{status: 500}
			);
		}

		const email = clerkUserData.email;
		const name =
			clerkUserData.name ||
			fallbackUserData.name ||
			fallbackUserData.email?.split('@')[0] ||
			'User';
		const metadata = clerkUserData.metadata || {};

		if (!email) {
			return NextResponse.json(
				{error: 'Clerk user does not have an email address'},
				{status: 400}
			);
		}

		let existingEmployee = await getEmployeeByClerkId(userId);
		if (!existingEmployee) {
			existingEmployee = await getEmployeeByEmail(email);
		}

		const currentRole = await getRoleByClerkId(userId);
		const previousRole =
			existingEmployee?.clerkUserId && existingEmployee.clerkUserId !== userId
				? await getRoleByClerkId(existingEmployee.clerkUserId)
				: null;

		const admins = await checkForAdmins();
		const isFirstUser = admins.length === 0;
		const finalRole = isFirstUser
			? 'admin'
			: normalizeRole(currentRole?.role) ||
				normalizeRole(previousRole?.role) ||
				normalizeRole(existingEmployee?.role) ||
				'staff';

		const finalLocations = mergeLocations(
			metadata?.locations,
			currentRole?.locations,
			previousRole?.locations,
			existingEmployee?.locations
		);

		const metadataDeviceId = metadata?.assignedDeviceId;
		const assignedDeviceId =
			finalRole === 'admin'
				? null
				: typeof metadataDeviceId === 'string' && metadataDeviceId.trim()
					? metadataDeviceId
					: existingEmployee?.assignedDeviceId || null;

		console.log(
			isFirstUser
				? 'First user - creating admin'
				: `Restoring user with role: ${finalRole}`
		);

		const existingUser =
			(await getUserByClerkId(userId)) || (await getUserByEmail(email));

		if (existingUser) {
			await db
				.update(users)
				.set({
					clerkUserId: userId,
					email,
					name,
					updatedAt: new Date(),
				})
				.where(eq(users.id, existingUser.id));
		} else {
			await db.insert(users).values({
				clerkUserId: userId,
				email,
				name,
				createdAt: new Date(),
			});
		}

		if (existingEmployee) {
			await db
				.update(employees)
				.set({
					clerkUserId: userId,
					name,
					email,
					workEmail: email,
					role: finalRole,
					locations: finalLocations,
					assignedDeviceId,
					hasAcceptedInvite: true,
					employmentStatus: existingEmployee.employmentStatus || 'active',
					onboardedBy: existingEmployee.onboardedBy || userId,
					onboardedAt: existingEmployee.onboardedAt || new Date(),
					updatedAt: new Date(),
				})
				.where(eq(employees.id, existingEmployee.id));
		} else {
			await db.insert(employees).values({
				name,
				email,
				workEmail: email,
				role: finalRole,
				locations: finalLocations,
				assignedDeviceId,
				clerkUserId: userId,
				createdAt: new Date(),
				createdBy: userId,
				employmentStatus: 'active',
				hasAcceptedInvite: true,
				onboardedBy: userId,
				onboardedAt: new Date(),
			});
		}

		if (currentRole) {
			await db
				.update(roles)
				.set({role: finalRole, locations: finalLocations})
				.where(eq(roles.id, currentRole.id));
		} else if (previousRole) {
			await db
				.update(roles)
				.set({
					clerkUserId: userId,
					role: finalRole,
					locations: finalLocations,
				})
				.where(eq(roles.id, previousRole.id));
		} else {
			await db.insert(roles).values({
				clerkUserId: userId,
				role: finalRole,
				locations: finalLocations,
				assignedAt: new Date(),
			});
		}

		console.log('User sync complete');

		return NextResponse.json({
			success: true,
			isFirstAdmin: isFirstUser,
			role: finalRole,
			locations: finalLocations,
		});
	} catch (error) {
		console.error('Error syncing user:', error);
		return NextResponse.json(
			{error: 'Internal server error', details: String(error)},
			{status: 500}
		);
	}
}
