import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {smokeDetectorChecks} from '@/db/schema';
import {and, eq, inArray} from 'drizzle-orm';

export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
	try {
		const {userId} = await auth();
		if (!userId) return NextResponse.json({error: 'Not authenticated'}, {status: 401});

		const {id} = await params;
		const role = await requireCareAccess(userId);
		const body = await req.json();
		const allowedLocations = role.locations || [];

		const existing = await db.query.smokeDetectorChecks.findFirst({
			where: eq(smokeDetectorChecks.id, id),
		});
		if (!existing) return NextResponse.json({error: 'Not found'}, {status: 404});
		if (role.role !== 'admin' && allowedLocations.length > 0 && !allowedLocations.includes(existing.location)) {
			return NextResponse.json({error: 'Location not allowed'}, {status: 403});
		}

		const [updated] = await db
			.update(smokeDetectorChecks)
			.set({
				location: body.location || existing.location,
				// date and staffInitials cannot be updated (auto-populated on create)
				smokeStatus: body.smokeStatus ?? existing.smokeStatus,
				coStatus: body.coStatus ?? existing.coStatus,
				notes: body.notes ?? existing.notes,
				updatedBy: userId,
				updatedAt: new Date(),
			})
			.where(eq(smokeDetectorChecks.id, id))
			.returning();

		return NextResponse.json(updated);
	} catch (error) {
		console.error('Error updating smoke detector check:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}

export async function DELETE(_req: NextRequest, {params}: {params: Promise<{id: string}>}) {
	try {
		const {userId} = await auth();
		if (!userId) return NextResponse.json({error: 'Not authenticated'}, {status: 401});

		const {id} = await params;
		const role = await requireCareAccess(userId);
		const allowedLocations = role.locations || [];

		const existing = await db.query.smokeDetectorChecks.findFirst({
			where: eq(smokeDetectorChecks.id, id),
		});
		if (!existing) return NextResponse.json({error: 'Not found'}, {status: 404});
		if (role.role !== 'admin' && allowedLocations.length > 0 && !allowedLocations.includes(existing.location)) {
			return NextResponse.json({error: 'Location not allowed'}, {status: 403});
		}

		await db.delete(smokeDetectorChecks).where(and(eq(smokeDetectorChecks.id, id)));
		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error deleting smoke detector check:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
