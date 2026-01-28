// =====================================
// Get recent logs for admin dashboard
// =====================================
import {NextRequest, NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db/index';
import {residentLogs} from '@/db/schema';
import {desc} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		await requireRole(['admin']);

		const logsCount = parseInt(req.nextUrl.searchParams.get('limit') || '50');
		const logs = await db.query.residentLogs.findMany({
			limit: logsCount,
			orderBy: [desc(residentLogs.createdAt)],
			with: {
				resident: true,
				activities: true,
			},
		});

		const formattedLogs = logs.map((log: any) => ({
			...log,
			residentName: log.resident?.name,
			residentLocation: log.resident?.location,
		}));

		return NextResponse.json(formattedLogs);
	} catch (error) {
		console.error('Error getting recent logs:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
