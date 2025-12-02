// ==========================================
// src/app/api/admin/residents/[id]/profile/route.ts
// ==========================================
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {updateResident} from '@/db/mutations/residents';
import {db} from '@/db/index';
import {residents} from '@/db/schema';
import {eq} from 'drizzle-orm';

// GET - Get resident profile
export async function GET(request: Request, {params}: {params: {id: string}}) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const residentId = params.id;
		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, residentId),
		});

		if (!resident) {
			return NextResponse.json({error: 'Resident not found'}, {status: 404});
		}

		return NextResponse.json(resident);
	} catch (error: any) {
		console.error('Error fetching resident profile:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}

// PATCH - Update resident profile
export async function PATCH(
	request: Request,
	{params}: {params: {id: string}}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		const residentId = params.id;
		const body = await request.json();

		const updated = await updateResident(residentId, {
			name: body.name,
			dateOfBirth: body.dateOfBirth,
			dob: body.dob, // Include dob if it's separate from dateOfBirth
			phone: body.phone,
			placementDate: body.placementDate
				? new Date(body.placementDate)
				: undefined,
			sex: body.sex,
			weight: body.weight,
			height: body.height,
			hairColor: body.hairColor,
			diagnostics: body.diagnostics,
			supportBroker: body.supportBroker,
			importantRelationships: body.importantRelationships,
			fundingAgency: body.fundingAgency,
			caseManagerName: body.caseManagerName,
			caseManagerPhone: body.caseManagerPhone,
			caseManagerEmail: body.caseManagerEmail,
			vocationalAgency: body.vocationalAgency,
			vocationalAgencyAddress: body.vocationalAgencyAddress,
			guardianIds: body.guardianIds,
			medicalInfo: body.medicalInfo,
			careNotes: body.careNotes,
			location: body.location,
		});

		await logAudit({
			clerkUserId: userId,
			event: 'UPDATE_RESIDENT_PROFILE',
			details: `Updated profile for resident ${residentId}`,
			deviceId: 'system',
			location: body.location || '',
		});

		return NextResponse.json(updated);
	} catch (error: any) {
		console.error('Error updating resident profile:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
