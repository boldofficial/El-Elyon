// =====================================
// Get recent logs for admin dashboard
// =====================================
import {NextRequest, NextResponse} from 'next/server';
import {requireRole} from '@/lib/auth';
import {db} from '@/db';
import {residentLogs} from '@/db/schema';
import {desc} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		await requireRole(['admin']);

		const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

		const logs = await db.query.residentLogs.findMany({
			limit,
			orderBy: [desc(residentLogs.createdAt)],
		});

		return NextResponse.json(logs);
	} catch (error) {
		console.error('Error getting recent logs:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
