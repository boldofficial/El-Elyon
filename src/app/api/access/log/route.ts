// ===================================
// Activity logging API
// ====================================
import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {auditLogs} from '@/db/schema';

export async function POST(req: Request) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const {activity, details} = await req.json();

		await db.insert(auditLogs).values({
			clerkUserId: userId,
			event: activity,
			deviceId: 'web',
			location: 'system',
			details: details || null,
			timestamp: new Date(),
		});

		return NextResponse.json({success: true});
	} catch (error) {
		console.error('Error logging activity:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
