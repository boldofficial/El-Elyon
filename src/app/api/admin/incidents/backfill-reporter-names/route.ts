// src/app/api/admin/incidents/backfill-reporter-names/route.ts
//
// One-time maintenance endpoint: populates `reported_by_name` on incident
// reports that were created before the name was being stored. Resolve order
// per reporter: employees.name -> Clerk full name -> 'Unknown'.
//
// Admin-only. Safe to re-run (idempotent) — it only touches rows whose
// reported_by_name is currently NULL or blank.

import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {requireAdminAccess, logAudit} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {incidentReports, employees} from '@/db/schema';
import {getClerkUser} from '@/lib/clerk';
import {eq, isNull, or} from 'drizzle-orm';

export async function POST() {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		await requireAdminAccess(userId);

		// Rows missing a display name.
		const staleReports = await db
			.select({
				id: incidentReports.id,
				reportedBy: incidentReports.reportedBy,
			})
			.from(incidentReports)
			.where(
				or(
					isNull(incidentReports.reportedByName),
					eq(incidentReports.reportedByName, '')
				)
			);

		if (staleReports.length === 0) {
			return NextResponse.json({
				success: true,
				scanned: 0,
				updated: 0,
				unresolved: 0,
				message: 'No incident reports needed backfilling.',
			});
		}

		// Resolve each distinct clerkUserId once, then reuse.
		const nameCache = new Map<string, string>();

		async function resolveName(clerkUserId: string): Promise<string> {
			const cached = nameCache.get(clerkUserId);
			if (cached) return cached;

			const employee = await db.query.employees.findFirst({
				where: eq(employees.clerkUserId, clerkUserId),
			});

			let name = employee?.name?.trim();
			if (!name) {
				const clerkUser = await getClerkUser(clerkUserId);
				name = clerkUser?.name || 'Unknown';
			}

			nameCache.set(clerkUserId, name);
			return name;
		}

		let updated = 0;
		let unresolved = 0;

		for (const report of staleReports) {
			const name = await resolveName(report.reportedBy);
			if (name === 'Unknown') unresolved++;

			await db
				.update(incidentReports)
				.set({reportedByName: name, updatedAt: new Date()})
				.where(eq(incidentReports.id, report.id));

			updated++;
		}

		await logAudit({
			clerkUserId: userId,
			event: 'BACKFILL_INCIDENT_REPORTER_NAMES',
			details: `scanned=${staleReports.length}, updated=${updated}, distinctReporters=${nameCache.size}, unresolved=${unresolved}`,
			deviceId: 'system',
			location: '',
		});

		return NextResponse.json({
			success: true,
			scanned: staleReports.length,
			updated,
			distinctReporters: nameCache.size,
			unresolved,
		});
	} catch (error: any) {
		console.error('Error backfilling incident reporter names:', error);
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
