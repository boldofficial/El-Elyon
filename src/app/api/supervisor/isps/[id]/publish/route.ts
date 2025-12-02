import {NextResponse} from 'next/server';
import {auth} from '@clerk/nextjs/server';
import {requireSupervisorAccess, logAudit} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {isp, residents} from '@/db/schema';
import {updateIsp} from '@/db/mutations/isp';
import {eq} from 'drizzle-orm';

export async function POST(
	request: Request,
	{params}: {params: Promise<{id: string}>}
) {
	const {userId} = await auth();
	if (!userId) {
		return NextResponse.json({error: 'Unauthorized'}, {status: 401});
	}

	try {
		const userRole = await requireSupervisorAccess(userId);

		const {id: ispId} = await params;
		if (!ispId) {
			return NextResponse.json({error: 'ISP ID is required'}, {status: 400});
		}

		const existingIsp = await db.query.isp.findFirst({
			where: eq(isp.id, ispId),
		});
		if (!existingIsp) {
			return NextResponse.json({error: 'ISP not found'}, {status: 404});
		}

		const resident = await db.query.residents.findFirst({
			where: eq(residents.id, existingIsp.residentId),
		});
		if (!resident) {
			return NextResponse.json(
				{error: 'Resident not found for this ISP'},
				{status: 404}
			);
		}

		// Check location access
		if (
			!userRole.locations ||
			!userRole.locations.includes(resident.location)
		) {
			await logAudit({
				clerkUserId: userId,
				event: 'PUBLISH_ISP_ACCESS_DENIED',
				details: `Access denied to resident ${existingIsp.residentId} for ISP publishing.`,
				deviceId: 'system', // Placeholder
				location: resident.location,
			});
			return NextResponse.json(
				{error: 'Access denied to this resident'},
				{status: 403}
			);
		}

		if (existingIsp.published) {
			return NextResponse.json({error: 'ISP already published'}, {status: 409});
		}

		await updateIsp(ispId, {published: true});

		await logAudit({
			clerkUserId: userId,
			event: 'PUBLISH_ISP_SUCCESS',
			details: `ISP ${ispId} published for resident ${existingIsp.residentId}.`,
			deviceId: 'system', // Placeholder
			location: resident.location,
		});
		return NextResponse.json(
			{message: 'ISP published successfully'},
			{status: 200}
		);
	} catch (error: any) {
		console.error('Error publishing ISP:', error);
		await logAudit({
			clerkUserId: userId,
			event: 'PUBLISH_ISP_FAILED',
			details: error.message,
			deviceId: 'system', // Placeholder
			location: '', // Placeholder
		});
		return NextResponse.json({error: error.message}, {status: 500});
	}
}
