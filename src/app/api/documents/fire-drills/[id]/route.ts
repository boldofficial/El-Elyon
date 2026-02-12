import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {requireCareAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {fireDrills} from '@/db/schema';
import {and, eq} from 'drizzle-orm';

async function verifyAccess(userId: string, id: string) {
	const role = await requireCareAccess(userId);
	const drill = await db.query.fireDrills.findFirst({where: (drill, {eq}) => eq(drill.id, id)});
	if (!drill) return {role, drill: null};
	if (role.role !== 'admin' && role.locations && !role.locations.includes(drill.location)) {
		throw new Error('Location not allowed');
	}
	return {role, drill};
}

export async function PATCH(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
	try {
		const {userId} = await auth();
		if (!userId) return NextResponse.json({error: 'Not authenticated'}, {status: 401});

		const {id} = await params;
		const {role, drill} = await verifyAccess(userId, id);
		if (!drill) return NextResponse.json({error: 'Not found'}, {status: 404});

		const body = await req.json();
		const updateData: any = {};
		if (body.location) updateData.location = body.location;
		if (body.year) updateData.year = parseInt(body.year, 10);
		if (body.sequence) updateData.sequence = parseInt(body.sequence, 10);
		if (body.residentName) updateData.residentName = body.residentName;
		// date, time, and staffName cannot be updated (auto-populated on create)
		if (body.comment !== undefined) updateData.comment = body.comment;
		updateData.updatedBy = userId;

		if (updateData.location && role.role !== 'admin' && role.locations && !role.locations.includes(updateData.location)) {
			return NextResponse.json({error: 'Location not allowed'}, {status: 403});
		}

		const [updated] = await db
			.update(fireDrills)
			.set(updateData)
			.where(eq(fireDrills.id, id))
			.returning();

		return NextResponse.json(updated);
	} catch (error) {
		if (error instanceof Error && error.message === 'Location not allowed') {
			return NextResponse.json({error: 'Location not allowed'}, {status: 403});
		}
		console.error('Error updating fire drill:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}

export async function DELETE(req: NextRequest, {params}: {params: Promise<{id: string}>}) {
	try {
		const {userId} = await auth();
		if (!userId) return NextResponse.json({error: 'Not authenticated'}, {status: 401});

		const {id} = await params;
		const {drill} = await verifyAccess(userId, id);
		if (!drill) return NextResponse.json({error: 'Not found'}, {status: 404});

		await db.delete(fireDrills).where(eq(fireDrills.id, id));
		return NextResponse.json({success: true});
	} catch (error) {
		if (error instanceof Error && error.message === 'Location not allowed') {
			return NextResponse.json({error: 'Location not allowed'}, {status: 403});
		}
		console.error('Error deleting fire drill:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
