// src/app/api/cron/generate-compliance-alerts/route.ts
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residents, ispFiles, fireEvac, complianceAlerts} from '@/db/schema';
import {eq, desc} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		// Verify Vercel Cron Secret
		const authHeader = req.headers.get('authorization');
		if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		console.log('🔔 Generating compliance alerts...');

		const residentsList = await db.query.residents.findMany();

		// Check ISP due dates
		for (const resident of residentsList) {
			const ispFilesList = await db.query.ispFiles.findMany({
				where: eq(ispFiles.residentId, resident.id),
			});

			const activeISP = ispFilesList.find((f) => f.status === 'active');

			if (activeISP) {
				const dueAt =
					activeISP.effectiveDate.getTime() + 6 * 30 * 24 * 60 * 60 * 1000;
				const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;

				if (dueAt <= thirtyDaysFromNow) {
					// Check if alert already exists
					const existingAlerts = await db.query.complianceAlerts.findMany({
						where: eq(complianceAlerts.location, resident.location),
					});

					const alreadyActive = existingAlerts.some(
						(a) =>
							a.active &&
							a.type === 'isp' &&
							a.metadata?.residentId === resident.id
					);

					if (!alreadyActive) {
						await db.insert(complianceAlerts).values({
							type: 'isp',
							title: 'ISP Due Soon',
							description: `ISP due soon for ${resident.name} at ${resident.location}`,
							location: resident.location,
							status: 'active',
							severity: 'medium',
							active: true,
							createdAt: new Date(),
							metadata: {residentId: resident.id},
						});
					}
				}
			}
		}

		// Check Fire Evac due dates
		for (const resident of residentsList) {
			const plans = await db.query.fireEvac.findMany({
				where: eq(fireEvac.residentId, resident.id),
				orderBy: [desc(fireEvac.createdAt)],
				limit: 1,
			});

			const latestPlan = plans[0];

			if (latestPlan) {
				const dueAt =
					(latestPlan.createdAt?.getTime() || Date.now()) +
					365 * 24 * 60 * 60 * 1000;
				const thirtyDaysFromNow = Date.now() + 30 * 24 * 60 * 60 * 1000;

				if (dueAt <= thirtyDaysFromNow) {
					const existingAlerts = await db.query.complianceAlerts.findMany({
						where: eq(complianceAlerts.location, resident.location),
					});

					const alreadyActive = existingAlerts.some(
						(a) =>
							a.active &&
							a.type === 'fire_evac' &&
							a.metadata?.residentId === resident.id
					);

					if (!alreadyActive) {
						await db.insert(complianceAlerts).values({
							type: 'fire_evac',
							title: 'Fire Evac Plan Due Soon',
							description: `Fire Evac plan due soon for ${resident.name}`,
							location: resident.location,
							status: 'active',
							severity: 'medium',
							active: true,
							createdAt: new Date(),
							metadata: {residentId: resident.id},
						});
					}
				}
			}
		}

		console.log('✅ Compliance alerts generated successfully');
		return NextResponse.json({success: true});
	} catch (error: any) {
		console.error('❌ Error generating compliance alerts:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
