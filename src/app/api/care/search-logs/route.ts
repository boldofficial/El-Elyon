import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs} from '@/db/schema';
import {eq, and, gte, lte, like, desc} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const query = req.nextUrl.searchParams.get('query') || '';
		const residentId = req.nextUrl.searchParams.get('residentId');
		const template = req.nextUrl.searchParams.get('template');
		const dateFrom = req.nextUrl.searchParams.get('dateFrom');
		const dateTo = req.nextUrl.searchParams.get('dateTo');
		const limit = parseInt(req.nextUrl.searchParams.get('limit') || '50');

		const conditions = [];

		if (query) {
			conditions.push(like(residentLogs.content, `%${query}%`));
		}
		if (residentId) {
			conditions.push(eq(residentLogs.residentId, residentId));
		}
		if (template) {
			conditions.push(eq(residentLogs.template, template));
		}
		if (dateFrom) {
			conditions.push(
				gte(residentLogs.createdAt, new Date(parseInt(dateFrom)))
			);
		}
		if (dateTo) {
			conditions.push(lte(residentLogs.createdAt, new Date(parseInt(dateTo))));
		}

		const logs = await db.query.residentLogs.findMany({
			where: conditions.length > 0 ? and(...conditions) : undefined,
			limit,
			orderBy: [desc(residentLogs.createdAt)],
		});

		return NextResponse.json(logs);
	} catch (error) {
		console.error('Error searching logs:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
