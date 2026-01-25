// ====================================
// Get residents API
// ===================================
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {residents} from '@/db/schema';

export async function GET() {
		const {userId} = await auth();
		if (!userId) {
				return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		try {
				await requireCareAccess(userId);

				const residentsList = await db.query.residents.findMany({
						orderBy: (residents, {asc}) => [asc(residents.name)],
				});

				return NextResponse.json(
						residentsList.map((r) => ({
								id: r.id,
								name: r.name,
								dateOfBirth: r.dateOfBirth,
								dob: r.dob, // Assuming dob is an alternative or additional date field
								location: r.location,
								phone: r.phone,
								placementDate: r.placementDate,
								sex: r.sex,
								weight: r.weight,
								height: r.height,
								hairColor: r.hairColor,
								diagnosis: r.diagnosis,
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

