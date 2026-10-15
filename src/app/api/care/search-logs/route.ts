import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs} from '@/db/schema';
import {eq, and, gte, lte, like, desc, inArray} from 'drizzle-orm';
import {
	AccessDeniedError,
	requireCareAccess,
	requireResidentInScope,
	scopedLocations,
} from '@/lib/db-helpers';

const MAX_LIMIT = 200;

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not authenticated'}, {status: 401});
		}

		const userRole = await requireCareAccess(userId);

		const query = req.nextUrl.searchParams.get('query') || '';
		const residentId = req.nextUrl.searchParams.get('residentId');
		const template = req.nextUrl.searchParams.get('template');
		const dateFrom = req.nextUrl.searchParams.get('dateFrom');
		const dateTo = req.nextUrl.searchParams.get('dateTo');
		const parsedLimit = parseInt(req.nextUrl.searchParams.get('limit') || '50', 10);
		const limit =
			Number.isFinite(parsedLimit) && parsedLimit > 0
				? Math.min(parsedLimit, MAX_LIMIT)
				: 50;

		const conditions = [];

		// Non-admins only search logs from their own locations.
		const allowedLocations = scopedLocations(userRole);
		if (allowedLocations) {
			if (allowedLocations.length === 0) return NextResponse.json([]);
			conditions.push(inArray(residentLogs.location, allowedLocations));
		}

		if (query) {
			conditions.push(like(residentLogs.content, `%${query}%`));
		}
		if (residentId) {
			await requireResidentInScope({
				clerkUserId: userId,
				userRole,
				residentId,
				auditDetail: 'search_logs_cross_location',
			});
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
		if (error instanceof AccessDeniedError) {
			return NextResponse.json({error: 'Access denied'}, {status: 403});
		}
		console.error('Error searching logs:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
