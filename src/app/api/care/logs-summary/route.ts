import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs} from '@/db/schema';
import {and, gte, inArray} from 'drizzle-orm';
import {AccessDeniedError, requireCareAccess, scopedLocations} from '@/lib/db-helpers';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userRole = await requireCareAccess(userId);

		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

		// Non-admins only see counts for their own locations.
		const allowedLocations = scopedLocations(userRole);
		const logs =
			allowedLocations && allowedLocations.length === 0
				? []
				: await db.query.residentLogs.findMany({
						where: allowedLocations
							? and(
									gte(residentLogs.createdAt, sevenDaysAgo),
									inArray(residentLogs.location, allowedLocations)
								)
							: gte(residentLogs.createdAt, sevenDaysAgo),
					});

		const myLogs = logs.filter((log) => log.createdBy === userId);

		const logsByLocation: Record<string, number> = {};
		const logsByTemplate: Record<string, number> = {};

		logs.forEach((log) => {
			if (log.location) {
				logsByLocation[log.location] = (logsByLocation[log.location] || 0) + 1;
			}
			if (log.template) {
				logsByTemplate[log.template] = (logsByTemplate[log.template] || 0) + 1;
			}
		});

		return NextResponse.json({
			totalLogs: logs.length,
			myLogs: myLogs.length,
			logsByLocation,
			logsByTemplate,
		});
	} catch (error) {
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: 'Access denied'}, {status: 403});
		}
		console.error('Error getting logs summary:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
