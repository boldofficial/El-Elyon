import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs, residents} from '@/db/schema';
import {eq, desc} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const residentId = req.nextUrl.searchParams.get('residentId');
		const limit = parseInt(req.nextUrl.searchParams.get('limit') || '20');

		let logs;

		if (residentId) {
			logs = await db.query.residentLogs.findMany({
				where: eq(residentLogs.residentId, residentId),
				limit,
				orderBy: [desc(residentLogs.createdAt)],
				with: {
					resident: true,
				},
			});
		} else {
			logs = await db.query.residentLogs.findMany({
				limit,
				orderBy: [desc(residentLogs.createdAt)],
				with: {
					resident: true,
				},
			});
		}

		return NextResponse.json(logs);
	} catch (error) {
		console.error('Error getting logs:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
