// src/app/api/guardians/[id]/route.ts

// Guardians API

import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {
	AccessDeniedError,
	requireCareAccess,
	requireAdminAccess,
	logAudit,
	scopedLocations,
} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {updateGuardian, deleteGuardian} from '@/db/mutations/guardians';
import {getGuardianById, residentIdsInLocations} from '@/db/queries/people';

export async function PATCH(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const userRole = await requireCareAccess(userId);

		const {id: guardianId} = await params;
		if (!guardianId) {
			return NextResponse.json(
				{error: 'Guardian ID is required'},
				{status: 400}
			);
		}

		const body = await request.json();
		const {name, email, phone, relationship, address} = body;
		let residentIds: string[] | undefined = body.residentIds;

		// Non-admins may only edit guardians of residents in their own locations.
		// They only ever see those links (GET filters the rest out), so links to
		// residents elsewhere are carried over rather than dropped on save.
		const allowedLocations = scopedLocations(userRole);
		if (allowedLocations) {
			const inScope = await residentIdsInLocations(allowedLocations);
			const existing = await getGuardianById(guardianId);
			const existingIds = existing?.residentIds || [];
			const requested = residentIds ?? existingIds.filter((id) => inScope.has(id));
			if (
				!existingIds.some((id) => inScope.has(id)) ||
				!Array.isArray(requested) ||
				!requested.every((id) => inScope.has(id))
			) {
				await logAudit({
					clerkUserId: userId,
					event: 'access_denied',
					details: `guardian_update_cross_location_${guardianId}`,
					deviceId: 'system',
					location: '',
				});
				throw new AccessDeniedError('Guardian is outside your locations');
			}
			residentIds = [...existingIds.filter((id) => !inScope.has(id)), ...requested];
		}

		await updateGuardian(guardianId, {
			name,
			email,
			phone,
			residentIds,
			relationship,
			address,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_GUARDIAN_SUCCESS',
			details: `Guardian ${guardianId} updated.`,
			deviceId: 'system', // Placeholder
			location: '', // Placeholder
		});
		return NextResponse.json(
			{message: 'Guardian updated successfully'},
			{status: 200}
		);
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: 'Access denied'}, {status: 403});
		}
		return internalServerError(error, 'UpdateGuardian');
	}
}

export async function DELETE(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId); // Only admin can delete guardians

		const {id: guardianId} = await params;
		if (!guardianId) {
			return NextResponse.json(
				{error: 'Guardian ID is required'},
				{status: 400}
			);
		}

		await deleteGuardian(guardianId);

		await logAudit({
			clerkUserId: userId,
			event: 'DELETE_GUARDIAN_SUCCESS',
			details: `Guardian ${guardianId} deleted.`,
			deviceId: 'system', // Placeholder
			location: '', // Placeholder
		});
		return NextResponse.json(
			{message: 'Guardian deleted successfully'},
			{status: 200}
		);
	} catch (error) {
		return internalServerError(error, 'DeleteGuardian');
	}
}
