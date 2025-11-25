import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {isp, ispAcknowledgments} from '@/db/schema';
import {eq, and} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const residentId = req.nextUrl.searchParams.get('residentId');

		if (!residentId) {
			return NextResponse.json({error: 'Resident ID required'}, {status: 400});
		}

		const currentIsp = await db.query.isp.findFirst({
			where: and(eq(isp.residentId, residentId), eq(isp.published, true)),
		});

		if (!currentIsp) {
			return NextResponse.json(null);
		}

		const acknowledgment = await db.query.ispAcknowledgments.findFirst({
			where: and(
				eq(ispAcknowledgments.ispId, currentIsp.id),
				eq(ispAcknowledgments.clerkUserId, userId)
			),
		});

		return NextResponse.json({
			...currentIsp,
			acknowledged: !!acknowledgment,
		});
	} catch (error) {
		console.error('Error getting ISP status:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
