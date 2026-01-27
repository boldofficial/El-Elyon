// src/app/api/care/resident-logs/route.ts

import {auth} from '@clerk/nextjs/server';
import {NextRequest, NextResponse} from 'next/server';
import {db} from '@/db/index';
import {residentLogs, residents} from '@/db/schema';
import {eq, desc, SQL} from 'drizzle-orm';

export async function GET(req: NextRequest) {
	try {
		const {userId} = await auth();

		if (!userId) {
			return NextResponse.json({error: 'Not uuuuuuuuauthenticated'}, {status: 401});
		}

		const searchParams = req.nextUrl.searchParams;
		const residentId = searchParams.get('residentId');
		const location = searchParams.get('location');
		const limit = parseInt(searchParams.get('limit') || '50');

		const conditions: SQL[] = [];

		if (residentId) {
			conditions.push(eq(residentLogs.residentId, residentId));
		}

		if (location) {
			conditions.push(eq(residentLogs.location, location));
		}

		const logs = await db.query.residentLogs.findMany({
			where: conditions.length > 0 ? (residentLogs, {and}) => and(...conditions) : undefined,
			limit,
			orderBy: [desc(residentLogs.createdAt)],
			with: {
				resident: true,
				activities: true,
			},
		});

		return NextResponse.json(logs);
	} catch (error) {
		console.error('Error getting logs:', error);
		return NextResponse.json({error: 'Internal server error'}, {status: 500});
	}
}
