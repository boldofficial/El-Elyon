import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireSupervisorAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {
	residents,
	isp,
	roles,
	employees,
	ispAcknowledgments,
} from '@/db/schema';
import {listPublishedIspsByResidentId} from '@/db/queries/isp';
import {generateNeutralId} from '@/lib/utils';
import {eq, and, InferSelectModel} from 'drizzle-orm';

type ResidentSelect = InferSelectModel<typeof residents>;
type IspSelect = InferSelectModel<typeof isp>;
type RoleSelect = InferSelectModel<typeof roles>;
type IspAcknowledgmentSelect = InferSelectModel<typeof ispAcknowledgments>;

export async function GET() {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const userRole = await requireSupervisorAccess(userId);

		// Get published ISPs for residents in supervisor's locations
		const allResidents = await db.query.residents.findMany();
		const locationResidents =
			userRole.role === 'admin'
				? allResidents
				: allResidents.filter(
						(r: ResidentSelect) =>
							userRole.locations && userRole.locations.includes(r.location)
					);

		const acknowledgments: any[] = [];

		for (const resident of locationResidents) {
			const publishedIsps = await listPublishedIspsByResidentId(resident.id);

			for (const singleIsp of publishedIsps) {
				// singleIsp is implicitly IspSelect
				// Get all staff who need to acknowledge this ISP
				const allStaffRoles = await db.query.roles.findMany();
				const relevantStaff = allStaffRoles.filter(
					(role: RoleSelect) =>
						role.role === 'staff' &&
						role.locations &&
						role.locations.includes(resident.location)
				);

				for (const staffRole of relevantStaff) {
					const employee = await db.query.employees.findFirst({
						where: eq(employees.clerkUserId, staffRole.clerkUserId),
					});
					if (!employee) continue;

					const acknowledgment: IspAcknowledgmentSelect | undefined =
						await db.query.ispAcknowledgments.findFirst({
							where: and(
								eq(ispAcknowledgments.residentId, resident.id),
								eq(ispAcknowledgments.clerkUserId, staffRole.clerkUserId),
								eq(ispAcknowledgments.ispId, singleIsp.id)
							),
						});

					acknowledgments.push({
						ispId: singleIsp.id,
						ispVersion: singleIsp.version || 1,
						residentNeutralId: generateNeutralId(resident.id),
						location: resident.location,
						clerkUserId: staffRole.clerkUserId,
						userName: employee.name,
						acknowledgedAt: acknowledgment?.acknowledgedAt,
					});
				}
			}
		}

		return NextResponse.json(
			acknowledgments.sort((a, b) => {
				// Sort by acknowledgment status, then by resident
				if (a.acknowledgedAt && !b.acknowledgedAt) return 1;
				if (!a.acknowledgedAt && b.acknowledgedAt) return -1;
				return a.residentNeutralId.localeCompare(b.residentNeutralId);
			})
		);
	} catch (error: any) {
		console.error('Error getting ISP acknowledgments:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
