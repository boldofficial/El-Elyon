import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {ispAcknowledgments} from '@/db/schema';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const {residentId, ispId} = await req.json();

		await db.insert(ispAcknowledgments).values({
			residentId,
			clerkUserId: userId,
			ispId,
			acknowledgedAt: new Date(),
			acknowledgedIsp: ispId,
		});

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error acknowledging ISP:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
