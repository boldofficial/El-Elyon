// src/app/api/cron/generate-compliance-alerts/route.ts

import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residents, ispFiles, fireEvac, complianceAlerts} from '@/db/schema';
import {eq, desc, sql} from 'drizzle-orm';

/**
 * CRON JOB: Generates compliance alerts for ISPs and Fire Evac plans
 * Runs: Every Monday at 9 AM (0 9 * * 1)
 *
 * Security: Uses Vercel Cron Secret from Authorization header
 */
export async function GET(req: NextRequest) {
	try {
		// ✅ Verify Vercel Cron Secret
		const authHeader = req.headers.get('authorization');
		const cronSecret = process.env.CRON_SECRET;

		if (!cronSecret) {
			console.error('❌ CRON_SECRET not configured in environment variables');
			return NextResponse.json(
				{error: 'Server misconfiguration'},
				{status: 500}
			);
		}

		if (authHeader !== `Bearer ${cronSecret}`) {
			console.error('❌ Unauthorized cron attempt');
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		console.log('🔔 Starting compliance alert generation...');

		const alertsGenerated = {
			isp: 0,
			fireEvac: 0,
		};

		// ========================================
		// Check ISP Due Dates
		// ========================================
		const allResidents = await db.query.residents.findMany();
		console.log(
			`📋 Checking ${allResidents.length} residents for ISP compliance`
		);

		for (const resident of allResidents) {
			try {
				// Get all ISP files for this resident
				const residentISPFiles = await db.query.ispFiles.findMany({
					where: eq(ispFiles.residentId, resident.id),
					orderBy: [desc(ispFiles.effectiveDate)],
				});

				// Find active ISP
				const activeISP = residentISPFiles.find((f) => f.status === 'active');

				if (activeISP) {
					// ISPs are due 6 months after effective date
					const sixMonthsInMs = 6 * 30 * 24 * 60 * 60 * 1000;
					const dueDate = new Date(
						activeISP.effectiveDate.getTime() + sixMonthsInMs
					);
					const thirtyDaysFromNow = new Date(
						Date.now() + 30 * 24 * 60 * 60 * 1000
					);

					// Check if due within 30 days
					if (dueDate <= thirtyDaysFromNow) {
						// Check if alert already exists for this resident
						const existingAlerts = await db.query.complianceAlerts.findMany({
							where: eq(complianceAlerts.location, resident.location),
						});

						const hasActiveAlert = existingAlerts.some(
							(a) =>
								a.active &&
								a.type === 'isp' &&
								a.metadata?.residentId === resident.id
						);

						if (!hasActiveAlert) {
							// Create new alert
							await db.insert(complianceAlerts).values({
								type: 'isp',
								title: 'ISP Due Soon',
								description: `ISP for ${resident.name} is due on ${dueDate.toLocaleDateString()}`,
								location: resident.location,
								status: 'active',
								severity: 'medium',
								active: true,
								createdAt: new Date(),
								metadata: {
									residentId: resident.id,
									// dueDate: dueDate.getTime(),
								},
							});

							alertsGenerated.isp++;
							console.log(`✅ Created ISP alert for ${resident.name}`);
						}
					}
				}
			} catch (error) {
				console.error(
					`❌ Error processing ISP for resident ${resident.id}:`,
					error
				);
				// Continue with next resident
			}
		}

		// ========================================
		// Check Fire Evac Due Dates
		// ========================================
		console.log(
			`🔥 Checking ${allResidents.length} residents for Fire Evac compliance`
		);

		for (const resident of allResidents) {
			try {
				// Get latest fire evac plan
				const fireEvacPlans = await db.query.fireEvac.findMany({
					where: eq(fireEvac.residentId, resident.id),
					orderBy: [desc(fireEvac.createdAt)],
					limit: 1,
				});

				const latestPlan = fireEvacPlans[0];

				if (latestPlan) {
					// Fire evac plans are due 1 year after creation
					const oneYearInMs = 365 * 24 * 60 * 60 * 1000;
					const dueDate = new Date(
						(latestPlan.createdAt?.getTime() || Date.now()) + oneYearInMs
					);
					const thirtyDaysFromNow = new Date(
						Date.now() + 30 * 24 * 60 * 60 * 1000
					);

					// Check if due within 30 days
					if (dueDate <= thirtyDaysFromNow) {
						// Check if alert already exists
						const existingAlerts = await db.query.complianceAlerts.findMany({
							where: eq(complianceAlerts.location, resident.location),
						});

						const hasActiveAlert = existingAlerts.some(
							(a) =>
								a.active &&
								a.type === 'fire_evac' &&
								a.metadata?.residentId === resident.id
						);

						if (!hasActiveAlert) {
							// Create new alert
							await db.insert(complianceAlerts).values({
								type: 'fire_evac',
								title: 'Fire Evac Plan Due Soon',
								description: `Fire Evac plan for ${resident.name} is due on ${dueDate.toLocaleDateString()}`,
								location: resident.location,
								status: 'active',
								severity: 'medium',
								active: true,
								createdAt: new Date(),
								metadata: {
									residentId: resident.id,
									// dueDate: dueDate.getTime(),
								},
							});

							alertsGenerated.fireEvac++;
							console.log(`✅ Created Fire Evac alert for ${resident.name}`);
						}
					}
				}
			} catch (error) {
				console.error(
					`❌ Error processing Fire Evac for resident ${resident.id}:`,
					error
				);
				// Continue with next resident
			}
		}

		console.log('✅ Compliance alert generation completed');
		console.log(
			`📊 Summary: ${alertsGenerated.isp} ISP alerts, ${alertsGenerated.fireEvac} Fire Evac alerts`
		);

		return NextResponse.json({
			success: true,
			alertsGenerated,
		});
	} catch (error: any) {
		console.error('❌ Fatal error in compliance alert generation:', error);
		return NextResponse.json(
			{
				error: error.message,
				stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
			},
			{status: 500}
		);
	}
}
