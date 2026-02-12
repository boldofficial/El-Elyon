import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {requireSupervisorAccess} from '@/lib/db-helpers';
import {db} from '@/db/index';
import {residentLogs} from '@/db/schema';
import {and, gte, lte, inArray} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();
		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userRole = await requireSupervisorAccess(userId);
		const searchParams = req.nextUrl.searchParams;
		const dateFrom = searchParams.get('dateFrom');
		const dateTo = searchParams.get('dateTo');

		const conditions: any[] = [];
		const scopedLocations = userRole.locations || [];

		if (dateFrom) {
			conditions.push(gte(residentLogs.createdAt, new Date(parseInt(dateFrom))));
		}
		if (dateTo) {
			conditions.push(lte(residentLogs.createdAt, new Date(parseInt(dateTo))));
		}
		if (scopedLocations.length > 0 && userRole.role !== 'admin') {
			conditions.push(inArray(residentLogs.location, scopedLocations));
		}

		const logs = await db.query.residentLogs.findMany({
			where: conditions.length > 0 ? and(...conditions) : undefined,
		});

		const logsByAuthor: Record<string, number> = {};
		const logsByTemplate: Record<string, number> = {};

		for (const log of logs) {
			const author = log.authorName || 'Unknown';
			logsByAuthor[author] = (logsByAuthor[author] || 0) + 1;

			if (log.template) {
				logsByTemplate[log.template] = (logsByTemplate[log.template] || 0) + 1;
			}
		}

		return NextResponse.json({
			totalLogs: logs.length,
			logsByAuthor,
			logsByTemplate,
		});
	} catch (error) {
		console.error('Error getting team log stats:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}