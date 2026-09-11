// src/app/api/cron/generate-compliance-alerts/route.ts

import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {
	residents,
	ispFiles,
	fireEvac,
	complianceAlerts,
	locations,
	smokeDetectorChecks,
	fireDrills,
	fireDrillReports,
} from '@/db/schema';
import {and, eq, desc, isNull} from 'drizzle-orm';
import {listResidentAdmissionDrillFacts} from '@/db/queries/life-safety';
import {
	admissionDrillAnchorDate,
	evaluateAdmissionDrill,
	toLocalDate,
} from '@/lib/life-safety-reporting';

/**
 * CRON JOB: Generates (and clears) compliance reminders.
 * Runs: Daily at 9 AM (0 9 * * *). It was weekly until admission drills
 * arrived; a 3-day deadline cannot be caught by a Monday-only sweep.
 *
 * Reminders covered:
 *   - ISP:             due = effectiveDate + 6 months; alert within 30 days   (supervisors + admins)
 *   - Fire evac:       due = createdAt + 12 months;   alert within 30 days   (supervisors + admins)
 *   - Smoke detector:  due = last check + 1 month;    alert within 7 days    (all users)
 *   - Fire drill:      due = last scheduled drill + 6 months; alert within 7 days (all users)
 *   - Admission drill: due = placement + 3 days; alert from placement day    (all users)
 *
 * Admission drills never satisfy the semiannual cadence and vice versa: the
 * fire-drill pass reads only drill_type = 'scheduled' reports.
 *
 * Each pass is idempotent: it ensures exactly one active alert per subject while
 * the item is due, and deactivates the alert once the item is updated (the
 * "until it is updated" behavior).
 *
 * Security: Uses Vercel Cron Secret from Authorization header.
 */

const DAY = 24 * 60 * 60 * 1000;
const ISP_PERIOD = 6 * 30 * DAY;
const FIRE_EVAC_PERIOD = 365 * DAY;
const SMOKE_PERIOD = 30 * DAY;
const FIRE_DRILL_PERIOD = 182 * DAY; // ~6 months
const DEADLINE_LEAD = 30 * DAY; // ISP / fire-evac: 1 month before
const SAFETY_LEAD = 7 * DAY; // smoke / fire-drill: 1 week before

export async function GET(req: NextRequest) {
	try {
		const authHeader = req.headers.get('authorization');
		const cronSecret = process.env.CRON_SECRET;

		if (!cronSecret) {
			console.error('❌ CRON_SECRET not configured');
			return NextResponse.json({error: 'Server misconfiguration'}, {status: 500});
		}
		if (authHeader !== `Bearer ${cronSecret}`) {
			console.error('❌ Unauthorized cron attempt');
			return NextResponse.json({error: 'Unauthorized'}, {status: 401});
		}

		console.log('🔔 Starting compliance alert generation...');

		const generated = {isp: 0, fireEvac: 0, smoke: 0, fireDrill: 0, admissionDrill: 0};
		const cleared = {isp: 0, fireEvac: 0, smoke: 0, fireDrill: 0, admissionDrill: 0};
		const now = Date.now();
		const today = toLocalDate(new Date(now));

		const allAlerts = await db.query.complianceAlerts.findMany();
		const activeAlerts = allAlerts.filter((a) => a.active);

		// Ensures a single active alert exists for a subject, keyed by a matcher.
		async function ensureAlert(
			match: (a: (typeof allAlerts)[number]) => boolean,
			values: {
				type: string;
				title: string;
				description: string;
				location: string;
				severity: string;
				metadata?: Record<string, unknown>;
			}
		): Promise<'created' | 'exists'> {
			if (activeAlerts.some(match)) return 'exists';
			await db.insert(complianceAlerts).values({
				type: values.type,
				title: values.title,
				description: values.description,
				location: values.location,
				status: 'active',
				severity: values.severity,
				active: true,
				createdAt: new Date(),
				metadata: values.metadata as any,
			});
			return 'created';
		}

		// Deactivates active alerts of a type that are no longer needed.
		async function clearStale(
			type: string,
			stillNeeded: (a: (typeof allAlerts)[number]) => boolean
		): Promise<number> {
			let count = 0;
			for (const alert of activeAlerts) {
				if (alert.type !== type) continue;
				if (stillNeeded(alert)) continue;
				await db
					.update(complianceAlerts)
					.set({active: false, status: 'resolved'})
					.where(eq(complianceAlerts.id, alert.id));
				count++;
			}
			return count;
		}

		const allResidents = await db.query.residents.findMany();

		// ---------- ISP (effectiveDate + 6 months) ----------
		const ispDueResidentIds = new Set<string>();
		for (const resident of allResidents) {
			const files = await db.query.ispFiles.findMany({
				where: eq(ispFiles.residentId, resident.id),
				orderBy: [desc(ispFiles.effectiveDate)],
			});
			const active = files.find((f) => f.status === 'active');
			if (!active) continue;

			const dueDate = active.effectiveDate.getTime() + ISP_PERIOD;
			if (dueDate - now > DEADLINE_LEAD) continue; // not within 1 month yet

			ispDueResidentIds.add(resident.id);
			const res = await ensureAlert(
				(a) =>
					a.type === 'isp' && a.metadata?.residentId === resident.id,
				{
					type: 'isp',
					title: 'ISP Due Soon',
					description: `ISP for ${resident.name} is due on ${new Date(
						dueDate
					).toLocaleDateString()}`,
					location: resident.location,
					severity: dueDate < now ? 'high' : 'medium',
					metadata: {residentId: resident.id},
				}
			);
			if (res === 'created') generated.isp++;
		}
		cleared.isp = await clearStale('isp', (a) =>
			a.metadata?.residentId
				? ispDueResidentIds.has(a.metadata.residentId)
				: true
		);

		// ---------- Fire evac (createdAt + 12 months) ----------
		const fireEvacDueResidentIds = new Set<string>();
		for (const resident of allResidents) {
			const plans = await db.query.fireEvac.findMany({
				where: eq(fireEvac.residentId, resident.id),
				orderBy: [desc(fireEvac.createdAt)],
				limit: 1,
			});
			const latest = plans[0];
			if (!latest) continue;

			const dueDate = (latest.createdAt?.getTime() || now) + FIRE_EVAC_PERIOD;
			if (dueDate - now > DEADLINE_LEAD) continue;

			fireEvacDueResidentIds.add(resident.id);
			const res = await ensureAlert(
				(a) =>
					a.type === 'fire_evac' &&
					a.metadata?.residentId === resident.id,
				{
					type: 'fire_evac',
					title: 'Fire Evac Plan Due Soon',
					description: `Fire Evac plan for ${resident.name} is due on ${new Date(
						dueDate
					).toLocaleDateString()}`,
					location: resident.location,
					severity: dueDate < now ? 'high' : 'medium',
					metadata: {residentId: resident.id},
				}
			);
			if (res === 'created') generated.fireEvac++;
		}
		cleared.fireEvac = await clearStale('fire_evac', (a) =>
			a.metadata?.residentId
				? fireEvacDueResidentIds.has(a.metadata.residentId)
				: true
		);

		// ---------- Location-based fire-safety reminders ----------
		const allLocations = await db.query.locations.findMany();
		const smokeDueLocations = new Set<string>();
		const fireDrillDueLocations = new Set<string>();

		for (const loc of allLocations) {
			// Smoke / CO detector — monthly
			const lastSmoke = await db.query.smokeDetectorChecks.findMany({
				where: eq(smokeDetectorChecks.location, loc.name),
				orderBy: [desc(smokeDetectorChecks.date)],
				limit: 1,
			});
			const smokeDue = lastSmoke[0]
				? lastSmoke[0].date.getTime() + SMOKE_PERIOD
				: now; // never checked → treat as due now
			if (smokeDue - now <= SAFETY_LEAD) {
				smokeDueLocations.add(loc.name);
				const res = await ensureAlert(
					(a) => a.type === 'smoke_detector' && a.location === loc.name,
					{
						type: 'smoke_detector',
						title: 'Smoke & CO Detector Check Due',
						description: lastSmoke[0]
							? `Monthly detector check for ${loc.name} is due (last done ${lastSmoke[0].date.toLocaleDateString()})`
							: `Monthly detector check for ${loc.name} has never been recorded`,
						location: loc.name,
						severity: smokeDue < now ? 'high' : 'medium',
					}
				);
				if (res === 'created') generated.smoke++;
			}

			// Fire drill — every 6 months. The supervisor workspace writes to
			// fire_drill_reports (v2); the legacy fire_drills rows are read-only
			// history, so take the most recent scheduled drill across both.
			const [lastV2Drill] = await db
				.select({drillDate: fireDrillReports.drillDate})
				.from(fireDrillReports)
				.where(
					and(
						eq(fireDrillReports.locationId, loc.id),
						eq(fireDrillReports.drillType, 'scheduled'),
						isNull(fireDrillReports.voidedAt)
					)
				)
				.orderBy(desc(fireDrillReports.drillDate))
				.limit(1);
			const lastLegacyDrill = await db.query.fireDrills.findMany({
				where: eq(fireDrills.location, loc.name),
				orderBy: [desc(fireDrills.date)],
				limit: 1,
			});
			const lastDrillAt = Math.max(
				lastV2Drill ? new Date(`${lastV2Drill.drillDate}T12:00:00`).getTime() : 0,
				lastLegacyDrill[0]?.date.getTime() ?? 0
			);
			const drillDue = lastDrillAt > 0 ? lastDrillAt + FIRE_DRILL_PERIOD : now;
			if (drillDue - now <= SAFETY_LEAD) {
				fireDrillDueLocations.add(loc.name);
				const res = await ensureAlert(
					(a) => a.type === 'fire_drill' && a.location === loc.name,
					{
						type: 'fire_drill',
						title: 'Fire Drill Due',
						description: lastDrillAt > 0
							? `Semiannual fire drill for ${loc.name} is due (last held ${new Date(lastDrillAt).toLocaleDateString()})`
							: `Fire drill for ${loc.name} has never been recorded`,
						location: loc.name,
						severity: drillDue < now ? 'high' : 'medium',
					}
				);
				if (res === 'created') generated.fireDrill++;
			}
		}
		cleared.smoke = await clearStale('smoke_detector', (a) =>
			smokeDueLocations.has(a.location)
		);
		cleared.fireDrill = await clearStale('fire_drill', (a) =>
			fireDrillDueLocations.has(a.location)
		);

		// ---------- Admission drill (placement + 3 days) ----------
		// Same evaluation the supervisor workspace uses, so the dashboard
		// reminder and the countdown panel can never disagree.
		const admissionDueResidentIds = new Set<string>();
		for (const fact of await listResidentAdmissionDrillFacts()) {
			const anchorDate = admissionDrillAnchorDate(fact);
			if (!anchorDate) continue;
			const evaluation = evaluateAdmissionDrill({
				anchorDate,
				drillDate: fact.latestAdmissionDrill?.drillDate ?? null,
				today,
			});
			if (evaluation.state !== 'due' && evaluation.state !== 'overdue') continue;

			admissionDueResidentIds.add(fact.residentId);
			const deadline = new Date(`${evaluation.deadline}T12:00:00`).toLocaleDateString();
			const res = await ensureAlert(
				(a) => a.type === 'admission_drill' && a.metadata?.residentId === fact.residentId,
				{
					type: 'admission_drill',
					title: 'Admission Fire Drill Due',
					description:
						evaluation.state === 'overdue'
							? `Admission drill for ${fact.residentName} was due by ${deadline} and has not been recorded`
							: `Admission drill for ${fact.residentName} must be held by ${deadline}`,
					location: fact.locationName,
					severity: evaluation.state === 'overdue' ? 'high' : 'medium',
					metadata: {residentId: fact.residentId},
				}
			);
			if (res === 'created') generated.admissionDrill++;
		}
		cleared.admissionDrill = await clearStale('admission_drill', (a) =>
			a.metadata?.residentId ? admissionDueResidentIds.has(a.metadata.residentId) : true
		);

		console.log('✅ Compliance alert generation completed', {generated, cleared});

		return NextResponse.json({success: true, generated, cleared});
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
