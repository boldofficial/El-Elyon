// ====================================
// Get residents API
// ===================================
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {db} from '@/db/index';
import {residents} from '@/db/schema';
import {activeResidentsOnly} from '@/lib/resident-status-sql';

// Residents who have left the facility are omitted by default. Every caller
// of this route is picking a resident to act on -- send a guardian checklist,
// start an onboarding, open a case -- and a former resident is not a valid
// target for any of that.
//
// Records views that genuinely need the full historical roster pass
// `?includeInactive=true` and get `status` / `inactiveReason` back so they can
// label what they are showing. The opt-in is deliberate: the failure mode of
// forgetting it is an incomplete archive, which is visible, rather than a
// departed resident silently reappearing in a picker, which is not.
export async function GET(request: Request) {
		const {userId} = await auth();
		if (!userId) {
				return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		try {
				await requireCareAccess(userId);

				const includeInactive =
						new URL(request.url).searchParams.get('includeInactive') === 'true';

				const residentsList = await db.query.residents.findMany({
						where: includeInactive ? undefined : activeResidentsOnly(),
						orderBy: (residents, {asc}) => [asc(residents.name)],
				});

				return NextResponse.json(
						residentsList.map((r) => ({
								id: r.id,
								name: r.name,
								dateOfBirth: r.dateOfBirth,
								dob: r.dob, // Assuming dob is an alternative or additional date field
								location: r.location,
								status: r.status,
								inactiveReason: r.inactiveReason,
								inactiveDate: r.inactiveDate,
								phone: r.phone,
								placementDate: r.placementDate,
								sex: r.sex,
								weight: r.weight,
								height: r.height,
								hairColor: r.hairColor,
								diagnosis: r.diagnosis,
								allergies: r.allergies,
								supportBroker: r.supportBroker,
								importantRelationships: r.importantRelationships,
								fundingAgency: r.fundingAgency,
								caseManagerName: r.caseManagerName,
								caseManagerPhone: r.caseManagerPhone,
								caseManagerEmail: r.caseManagerEmail,
								vocationalAgency: r.vocationalAgency,
								vocationalAgencyAddress: r.vocationalAgencyAddress,
								guardianIds: r.guardianIds,
								medicalInfo: r.medicalInfo,
								careNotes: r.careNotes,
								profileImageId: r.profileImageId,
								createdAt: r.createdAt,
								createdBy: r.createdBy,
						}))
				);
		} catch (error: any) {
				console.error('Error fetching residents:', error);
				return NextResponse.json({error: error.message}, {status: 500});
		}
}


///

