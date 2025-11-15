import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireSupervisorAccess, logAudit} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {residents, isp} from '@/db/schema';
import {listIspsByResidentId} from '@/db/queries/isp';
import {insertIsp} from '@/db/mutations/isp';
import {generateNeutralId} from '@/lib/utils';
import {eq, desc, InferSelectModel} from 'drizzle-orm';

type ResidentSelect = InferSelectModel<typeof residents>;
type IspSelect = InferSelectModel<typeof isp>;

export async function GET() {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        const userRole = await requireSupervisorAccess(userId);

        // Get residents in supervisor's locations
        const allResidents = await db.query.residents.findMany();
        const locationResidents =
            userRole.role === 'admin'
                ? allResidents
                : allResidents.filter(
                      (r: ResidentSelect) => userRole.locations && userRole.locations.includes(r.location)
                  );

        const isps: any[] = [];
        for (const resident of locationResidents) {
            const residentIsps = await listIspsByResidentId(resident.id);

            for (const singleIsp of residentIsps) {
                isps.push({
                    id: singleIsp.id,
                    residentNeutralId: generateNeutralId(resident.id),
                    version: singleIsp.version || 1,
                    published: singleIsp.published,
                    content: singleIsp.content || '',
                    goals: singleIsp.goals || [],
                    createdAt: singleIsp.createdAt,
                    dueAt: singleIsp.dueAt,
                });
            }
        }

        return NextResponse.json(isps.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)));
    } catch (error: any) {
        console.error('Error getting location ISPs:', error);
        return NextResponse.json({error: error.message}, {status: 500});
    }
}

export async function POST(request: Request) {
    const {userId} = await auth();
    if (!userId) {
        return NextResponse.json({error: 'Unauthorized'}, {status: 401});
    }

    try {
        const userRole = await requireSupervisorAccess(userId);

        const body = await request.json();
        const {residentId, content, goals} = body;

        if (!residentId || !content || !goals) {
            return NextResponse.json({error: 'Missing required fields: residentId, content, goals'}, {status: 400});
        }

        const resident = await db.query.residents.findFirst({
            where: eq(residents.id, residentId),
        });
        if (!resident) {
            return NextResponse.json({error: 'Resident not found'}, {status: 404});
        }

        // Check location access
        if (!userRole.locations.includes(resident.location)) {
            await logAudit({
                clerkUserId: userId,
                event: 'CREATE_ISP_ACCESS_DENIED',
                details: `Access denied to resident ${residentId} for ISP creation.`,
                deviceId: 'system', // Placeholder
                location: resident.location,
            });
            return NextResponse.json({error: 'Access denied to this resident'}, {status: 403});
        }

        // Get next version number
        const lastIsp = await db.query.isp.findFirst({
            where: eq(isp.residentId, residentId),
            orderBy: (ispTable: typeof isp) => [desc(ispTable.version)],
        });

        const version = (lastIsp?.version || 0) + 1;
        const dueAt = new Date();
        dueAt.setFullYear(dueAt.getFullYear() + 1); // 1 year from now

        const newIsp = await insertIsp({
            residentId,
            published: false,
            content,
            goals,
            version,
            createdAt: new Date(),
            dueAt,
        });

        await logAudit({
            clerkUserId: userId,
            event: 'CREATE_ISP_SUCCESS',
            details: `ISP ${newIsp.id} created for resident ${residentId}, version ${version}.`,
            deviceId: 'system', // Placeholder
            location: resident.location,
        });

        return NextResponse.json({ispId: newIsp.id}, {status: 201});
    } catch (error: any) {
        console.error('Error creating ISP:', error);
        await logAudit({
            clerkUserId: userId,
            event: 'CREATE_ISP_FAILED',
            details: error.message,
            deviceId: 'system', // Placeholder
            location: '', // Placeholder
        });
        return NextResponse.json({error: error.message}, {status: 500});
    }
}
