// ====================================
// Get residents API
// ===================================
import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {AccessDeniedError, requireCareAccess, scopedLocations} from '@/lib/db-helpers';
import {internalServerError} from '@/lib/api-errors';
import {db} from '@/db/index';
import {residents} from '@/db/schema';
import {inArray} from 'drizzle-orm';

export async function GET() {
		const {userId} = await auth();
		if (!userId) {
				return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		try {
				const userRole = await requireCareAccess(userId);

				// Non-admins only see residents in their own locations.
				const locations = scopedLocations(userRole);
				if (locations && locations.length === 0) {
						return NextResponse.json([]);
				}

				const residentsList = await db.query.residents.findMany({
						where: locations ? inArray(residents.location, locations) : undefined,
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
				if (error instanceof AccessDeniedError) {
						return NextResponse.json({error: 'Access denied'}, {status: 403});
				}
				console.error('Error fetching residents:', error);
				return NextResponse.json({error: error.message}, {status: 500});
		}
}


///

