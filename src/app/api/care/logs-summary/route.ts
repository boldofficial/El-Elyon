import {auth} from '@clerk/nextjs/server';
import {NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs} from '@/db/schema';
import {eq, gte} from 'drizzle-orm';

export async function GET() {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

		const logs = await db.query.residentLogs.findMany({
			where: gte(residentLogs.createdAt, sevenDaysAgo),
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
		console.error('Error getting logs summary:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
