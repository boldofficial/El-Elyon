import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {isp, ispAcknowledgments} from '@/db/schema';
import {eq, and, isNull} from 'drizzle-orm';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const publishedIsps = await db.query.isp.findMany({
			where: eq(isp.published, true),
		});

		const pending = [];

		for (const ispRecord of publishedIsps) {
			const ack = await db.query.ispAcknowledgments.findFirst({
				where: and(
					eq(ispAcknowledgments.ispId, ispRecord.id),
					eq(ispAcknowledgments.clerkUserId, userId)
				),
			});

			if (!ack) {
				pending.push({
					ispId: ispRecord.id,
					residentId: ispRecord.residentId,
					ispVersion: ispRecord.version,
					dueAt: ispRecord.dueAt,
				});
			}
		}

		return NextResponse.json(pending);
	} catch (error) {
		console.error('Error getting pending acknowledgments:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
